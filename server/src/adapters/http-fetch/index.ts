/**
 * http-fetch adapter — fetches a small text document from a public https URL.
 *
 * Used by skill import-from-URL. The URL is user-supplied, so this is the SSRF
 * chokepoint: https only, every hop's host must resolve to public addresses
 * only, redirects are followed manually (max 3, each re-checked), and the body
 * is capped in bytes and time. Swappable in tests via ContainerOverrides.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { ExternalServiceError, ValidationError } from '../../platform/errors.js';

export interface FetchTextOptions {
  maxBytes: number;
  timeoutMs: number;
}

export interface HttpFetcher {
  getText(url: string, opts: FetchTextOptions): Promise<string>;
}

const MAX_REDIRECTS = 3;

/** True for loopback, private, link-local, CGNAT, unspecified and ULA addresses. */
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
    const mapped = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^f[cd]/.test(low) || /^fe[89ab]/.test(low);
  }
  return true;
}

async function assertPublicHttps(url: URL): Promise<void> {
  if (url.protocol !== 'https:') throw new ValidationError('Only https URLs can be imported');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new ValidationError('URL resolves to a private or local address');
  }
}

/** Read the body as text, aborting as soon as it passes `maxBytes`. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ValidationError(`Document is larger than ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export class NodeHttpFetcher implements HttpFetcher {
  async getText(rawUrl: string, { maxBytes, timeoutMs }: FetchTextOptions): Promise<string> {
    let url = new URL(rawUrl);
    const signal = AbortSignal.timeout(timeoutMs);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHttps(url);
      let res: Response;
      try {
        res = await fetch(url, { redirect: 'manual', signal });
      } catch (err) {
        throw new ExternalServiceError(`Fetching ${url.host} failed: ${(err as Error).message}`);
      }
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location');
        if (!next) throw new ExternalServiceError('Redirect without a location');
        url = new URL(next, url);
        continue;
      }
      if (!res.ok) throw new ExternalServiceError(`Fetching ${url.host} returned ${res.status}`);
      const declared = Number(res.headers.get('content-length') ?? 0);
      if (declared > maxBytes) throw new ValidationError(`Document is larger than ${maxBytes} bytes`);
      return readCapped(res, maxBytes);
    }
    throw new ExternalServiceError('Too many redirects');
  }
}
