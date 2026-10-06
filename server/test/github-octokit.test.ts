/**
 * `OctokitGitHubClient` issue and file reads (`adapters/github/octokit.ts`): the SDK's
 * HTTP is stubbed through the constructor's `fetch` seam, so nothing leaves the process.
 * Contract under test: SDK response → port type, and SDK error → `ExternalServiceError`
 * (a 404 is a value, never an exception). A 403 is used for failures: 429 and 5xx are
 * retried with backoff (`src/platform/resilience.ts`), a 403 is not.
 */
import { describe, it, expect } from 'vitest';
import { OctokitGitHubClient } from '../src/adapters/github/octokit.js';
import { ExternalServiceError } from '../src/platform/errors.js';

const TOKEN = 'test-token';
const repo = { owner: 'o', name: 'r' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** A client whose HTTP is a stub answering with `respond`; `urls` records each request. */
function clientWith(respond: () => Response) {
  const urls: string[] = [];
  const stub = (async (input: Parameters<typeof fetch>[0]) => {
    urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return respond();
  }) as typeof fetch;
  return { client: new OctokitGitHubClient(TOKEN, { fetch: stub }), urls };
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error('expected the promise to reject');
}

describe('OctokitGitHubClient.getIssue', () => {
  it('maps a 200 payload to IssueMeta', async () => {
    const { client, urls } = clientWith(() =>
      json(200, { number: 5, title: 'Rate limit', body: 'Details', state: 'open', labels: [], user: { login: 'x' } }),
    );
    expect(await client.getIssue(repo, 5)).toEqual({ number: 5, title: 'Rate limit', body: 'Details', state: 'open' });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/repos/o/r/issues/5');
  });

  it('resolves null for a 404', async () => {
    const { client } = clientWith(() => json(404, { message: 'Not Found' }));
    expect(await client.getIssue(repo, 5)).toBeNull();
  });

  it('rejects a 403 with an ExternalServiceError that names the call and holds no secret, after one request', async () => {
    const { client, urls } = clientWith(() => json(403, { message: `Forbidden for ${TOKEN}` }));
    const err = await rejection(client.getIssue(repo, 5));
    expect(err).toBeInstanceOf(ExternalServiceError);
    const e = err as ExternalServiceError;
    expect(e.code).toBe('external_service_error');
    expect(e.message).toContain('getIssue');
    expect(e.message).toContain('o/r#5');
    expect(e.message).toContain('403');
    expect(e.details).toEqual({ status: 403 });
    expect(JSON.stringify({ message: e.message, details: e.details })).not.toContain(TOKEN);
    expect(urls).toHaveLength(1);
  });
});

describe('OctokitGitHubClient.getFileContent', () => {
  const text = '# Spec\n\nAllow 100 requests a minute.\n';
  const filePayload = {
    type: 'file',
    name: 'spec.md',
    path: 'docs/spec.md',
    encoding: 'base64',
    size: Buffer.byteLength(text),
    content: Buffer.from(text).toString('base64'),
  };

  it('maps a file payload to { file }, asking for the path at the ref', async () => {
    const { client, urls } = clientWith(() => json(200, filePayload));
    expect(await client.getFileContent(repo, 'docs/spec.md', 'a1b2c3d4')).toEqual({
      file: { path: 'docs/spec.md', ref: 'a1b2c3d4', content: text, size: Buffer.byteLength(text) },
    });
    expect(urls).toHaveLength(1);
    // the SDK percent-encodes the path segment (`docs%2Fspec.md`), so compare decoded
    expect(decodeURIComponent(urls[0]!)).toContain('/repos/o/r/contents/docs/spec.md');
    expect(urls[0]).toContain('ref=a1b2c3d4');
  });

  it('resolves { file: null, reason: not_found } for a 404', async () => {
    const { client } = clientWith(() => json(404, { message: 'Not Found' }));
    expect(await client.getFileContent(repo, 'docs/missing.md', 'main')).toEqual({
      file: null,
      reason: 'not_found',
    });
  });

  it('resolves reason not_a_file for a directory payload', async () => {
    const { client } = clientWith(() => json(200, [{ type: 'file', name: 'spec.md', path: 'docs/spec.md', size: 3 }]));
    expect(await client.getFileContent(repo, 'docs', 'main')).toEqual({ file: null, reason: 'not_a_file' });
  });

  it('resolves reason too_large for a file above maxBytes', async () => {
    const { client } = clientWith(() => json(200, filePayload));
    expect(await client.getFileContent(repo, 'docs/spec.md', 'main', { maxBytes: 10 })).toEqual({
      file: null,
      reason: 'too_large',
    });
  });

  it('rejects a 403 with an ExternalServiceError that names the call and holds no secret, after one request', async () => {
    const { client, urls } = clientWith(() => json(403, { message: `Forbidden for ${TOKEN}` }));
    const err = await rejection(client.getFileContent(repo, 'docs/spec.md', 'a1b2c3d4'));
    expect(err).toBeInstanceOf(ExternalServiceError);
    const e = err as ExternalServiceError;
    expect(e.code).toBe('external_service_error');
    expect(e.message).toContain('getFileContent');
    expect(e.message).toContain('o/r');
    expect(e.message).toContain('docs/spec.md@a1b2c3d4');
    expect(e.message).toContain('403');
    expect(e.details).toEqual({ status: 403 });
    expect(JSON.stringify({ message: e.message, details: e.details })).not.toContain(TOKEN);
    expect(urls).toHaveLength(1);
  });
});
