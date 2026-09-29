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

/** The IPv4 address inside an IPv4-mapped IPv6 address (`::ffff:a.b.c.d` or `::ffff:7f00:1`). */
function mappedIPv4(low: string): string | undefined {
  const dotted = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = low.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return undefined;
  const hi = parseInt(hex[1]!, 16);
  const lo = parseInt(hex[2]!, 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
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
    const low = ip.toLowerCase();
    if (low === '::' || low === '::1') return true;
    const v4 = mappedIPv4(low);
    if (v4) return isPrivateAddress(v4);
    return /^f[cd]/.test(low) || /^fe[89ab]/.test(low) || /^ff/.test(low);
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
      return readCapped(res, maxBytes);
    }
    throw new ExternalServiceError('Too many redirects');
  }
}
