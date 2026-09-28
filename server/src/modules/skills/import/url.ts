import { ValidationError } from '../../../platform/errors.js';

/**
 * Pure URL rules for import-from-URL. The fetch itself (and the SSRF guard)
 * lives in the http-fetch adapter.
 */

/** Max bytes fetched for a URL import. */
export const URL_IMPORT_MAX_BYTES = 262_144;
export const URL_IMPORT_TIMEOUT_MS = 10_000;

/**
 * Validate a user-supplied skill URL and return what to fetch plus a fallback
 * name. `github.com/<o>/<r>/blob/<ref>/<path>` becomes its raw.githubusercontent URL.
 */
export function resolveSkillUrl(raw: string): { fetchUrl: string; fallbackName: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ValidationError('Not a valid URL');
  }
  if (url.protocol !== 'https:') throw new ValidationError('Only https URLs can be imported');

  if (url.hostname === 'github.com') {
    const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
    if (!m) throw new ValidationError('Link to a file on GitHub (…/blob/<branch>/<path>.md)');
    url = new URL(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`);
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const file = decodeURIComponent(segments.at(-1) ?? '');
  if (!/\.md$/i.test(file)) throw new ValidationError('The URL must point to a .md file');
  const fallbackName = /^skill\.md$/i.test(file)
    ? decodeURIComponent(segments.at(-2) ?? 'imported-skill')
    : file.replace(/\.md$/i, '');
  return { fetchUrl: url.toString(), fallbackName };
}
