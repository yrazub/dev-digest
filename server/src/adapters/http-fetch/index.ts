/**
 * http-fetch adapter — fetches a small text document from a public https URL.
 *
 * Used by skill import-from-URL. The URL is user-supplied, so this is the SSRF
 * chokepoint: https only; every connection goes through `publicOnlyLookup`,
 * which resolves the host AT CONNECT TIME and refuses private addresses — so
 * the address that was checked is the address connected to (no DNS-rebinding
 * window between a check and a second lookup). IP-literal hosts skip DNS and
 * are checked up front. Redirects are followed manually (max 3, each hop
 * re-checked), and the body is capped in bytes and time. Swappable in tests
 * via ContainerOverrides.
 */
import dns from 'node:dns';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';
import { isIP, type LookupFunction } from 'node:net';
import { AppError, ExternalServiceError, ValidationError } from '../../platform/errors.js';

export interface FetchTextOptions {
  maxBytes: number;
  timeoutMs: number;
}

export interface HttpFetcher {
  getText(url: string, opts: FetchTextOptions): Promise<string>;
}

const MAX_REDIRECTS = 3;
const PRIVATE_ADDRESS = 'URL resolves to a private or local address';

/** An IPv6 address as its 8 hextets (numbers); a trailing dotted IPv4 counts as two. */
function hextets(ip: string): number[] {
  let text = ip.toLowerCase();
  const v4 = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    text = text.slice(0, v4.index) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', tail] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const fill = tail === undefined ? [] : Array(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right].map((h) => parseInt(h, 16));
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/**
 * The IPv4 address an IPv6 address embeds and would reach: IPv4-mapped
 * (`::ffff:0:0/96`), NAT64 (`64:ff9b::/96`) and 6to4 (`2002::/16`).
 */
function embeddedIPv4(h: number[]): string | undefined {
  const zeros = (from: number, to: number) => h.slice(from, to).every((x) => x === 0);
  if (zeros(0, 5) && h[5] === 0xffff) return v4From(h[6]!, h[7]!);
  if (h[0] === 0x64 && h[1] === 0xff9b && zeros(2, 6)) return v4From(h[6]!, h[7]!);
  if (h[0] === 0x2002) return v4From(h[1]!, h[2]!);
  return undefined;
}

/** True for loopback, private, link-local, CGNAT, multicast, unspecified and ULA addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (v === 6) {
    const h = hextets(ip);
    if (h.slice(0, 7).every((x) => x === 0) && h[7]! <= 1) return true; // :: and ::1
    const v4 = embeddedIPv4(h);
    if (v4) return isPrivateAddress(v4);
    const first = h[0]!;
    return (
      (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
      (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
      (first & 0xffc0) === 0xfec0 || // fec0::/10 site-local (deprecated)
      (first & 0xff00) === 0xff00 || // ff00::/8 multicast
      (first === 0x2001 && h[1] === 0) // 2001::/32 Teredo — tunnels to an unknown IPv4
    );
  }
  return true;
}

/**
 * A `lookup` for the https agent that refuses any host resolving to a private
 * address. Node calls it when the socket connects, so the vetted address is the
 * one used.
 */
export const publicOnlyLookup = ((hostname: string, options: dns.LookupOptions, callback: Function) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(new ValidationError(PRIVATE_ADDRESS));
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
}) as LookupFunction;

function assertHttpsPublicLiteral(url: URL): void {
  if (url.protocol !== 'https:') throw new ValidationError('Only https URLs can be imported');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // IP literals never reach the lookup hook, so check them here.
  if (isIP(host) && isPrivateAddress(host)) throw new ValidationError(PRIVATE_ADDRESS);
}

function get(url: URL, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { lookup: publicOnlyLookup, signal, headers: { accept: 'text/markdown, text/plain, */*' } }, resolve);
    req.on('error', reject);
  });
}

/** Read the body as text, aborting as soon as it passes `maxBytes`. */
async function readCapped(res: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res) {
    const buf = chunk as Buffer;
    total += buf.byteLength;
    if (total > maxBytes) {
      res.destroy();
      throw new ValidationError(`Document is larger than ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export class NodeHttpFetcher implements HttpFetcher {
  async getText(rawUrl: string, { maxBytes, timeoutMs }: FetchTextOptions): Promise<string> {
    let url = new URL(rawUrl);
    const signal = AbortSignal.timeout(timeoutMs);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      assertHttpsPublicLiteral(url);
      let res: IncomingMessage;
      try {
        res = await get(url, signal);
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new ExternalServiceError(`Fetching ${url.host} failed: ${(err as Error).message}`);
      }
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        res.resume();
        const next = res.headers.location;
        if (!next) throw new ExternalServiceError('Redirect without a location');
        url = new URL(next, url);
        continue;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        throw new ExternalServiceError(`Fetching ${url.host} returned ${status}`);
      }
      if (Number(res.headers['content-length'] ?? 0) > maxBytes) {
        res.destroy();
        throw new ValidationError(`Document is larger than ${maxBytes} bytes`);
      }
      try {
        return await readCapped(res, maxBytes);
      } catch (err) {
        if (err instanceof AppError) throw err;
        throw new ExternalServiceError(`Reading ${url.host} failed: ${(err as Error).message}`);
      }
    }
    throw new ExternalServiceError('Too many redirects');
  }
}
