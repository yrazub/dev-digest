/**
 * `toRepoFile` (`adapters/github/content.ts`): a GitHub contents-API payload to a
 * `RepoFileResult`. Pure, so the decoding rules are tested without Octokit.
 */
import { describe, it, expect } from 'vitest';
import { toRepoFile } from '../src/adapters/github/content.js';

const MAX = 200_000;
const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64');

function filePayload(content: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'file',
    encoding: 'base64',
    size: Buffer.byteLength(content, 'utf-8'),
    content: b64(content),
    ...extra,
  };
}

describe('toRepoFile', () => {
  it('decodes a base64 file to { file } with its path, ref and size', () => {
    const text = '# Rate limit\n\nAllow 100 requests a minute.\n';
    expect(toRepoFile(filePayload(text), 'docs/spec.md', 'a1b2c3d4', MAX)).toEqual({
      file: { path: 'docs/spec.md', ref: 'a1b2c3d4', content: text, size: Buffer.byteLength(text, 'utf-8') },
    });
  });

  it('decodes UTF-8 and GitHub-style base64 with line breaks', () => {
    const text = 'Zażółć gęślą jaźń — café ✓';
    const wrapped = (b64(text).match(/.{1,16}/g) ?? []).join('\n');
    const result = toRepoFile(filePayload(text, { content: wrapped }), 'docs/a.md', 'main', MAX);
    expect(result).toMatchObject({ file: { content: text } });
  });

  it('reads a file whose size is exactly maxBytes', () => {
    const result = toRepoFile(filePayload('abcde'), 'a.md', 'main', 5);
    expect(result).toMatchObject({ file: { content: 'abcde', size: 5 } });
  });

  it('returns not_a_file for a directory listing', () => {
    expect(toRepoFile([{ type: 'file', name: 'a.md', size: 3 }], 'docs', 'main', MAX)).toEqual({
      file: null,
      reason: 'not_a_file',
    });
  });

  it.each([
    ['a symlink', { type: 'symlink', size: 12, target: 'other.md' }],
    ['a submodule', { type: 'submodule', size: 0, submodule_git_url: 'https://github.com/x/y.git' }],
  ])('returns not_a_file for %s', (_name, payload) => {
    expect(toRepoFile(payload, 'docs/link.md', 'main', MAX)).toEqual({ file: null, reason: 'not_a_file' });
  });

  it.each([null, undefined, 'a string', 42])('returns not_a_file, never not_found, for the input %j', (payload) => {
    expect(toRepoFile(payload, 'docs/a.md', 'main', MAX)).toEqual({ file: null, reason: 'not_a_file' });
  });

  it('returns too_large for a file above maxBytes', () => {
    const result = toRepoFile(filePayload('abcdef'), 'big.md', 'main', 5);
    expect(result).toEqual({ file: null, reason: 'too_large' });
  });

  it('returns empty for a file with empty content', () => {
    expect(toRepoFile(filePayload(''), 'a.md', 'main', MAX)).toEqual({ file: null, reason: 'empty' });
  });

  it('returns empty when the content is absent or decodes to nothing', () => {
    const { content: _drop, ...noContent } = filePayload('x');
    expect(toRepoFile({ ...noContent, size: 1 }, 'a.md', 'main', MAX)).toEqual({ file: null, reason: 'empty' });
    expect(toRepoFile(filePayload('x', { content: '\n' }), 'a.md', 'main', MAX)).toEqual({
      file: null,
      reason: 'empty',
    });
  });

  it('returns not_a_file for a file payload without a numeric size', () => {
    const { size: _drop, ...noSize } = filePayload('hello');
    expect(toRepoFile(noSize, 'a.md', 'main', MAX)).toEqual({ file: null, reason: 'not_a_file' });
    expect(toRepoFile({ ...noSize, size: '5' }, 'a.md', 'main', MAX)).toEqual({ file: null, reason: 'not_a_file' });
  });

  it('returns too_large when the payload is both above maxBytes and empty (the size check comes first)', () => {
    expect(toRepoFile({ type: 'file', encoding: 'base64', size: 500, content: '' }, 'a.md', 'main', 100)).toEqual({
      file: null,
      reason: 'too_large',
    });
  });
});
