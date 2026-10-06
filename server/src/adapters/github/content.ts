import type { RepoFileResult } from '@devdigest/shared';

/**
 * The part of a GitHub contents-API file payload this adapter reads. A directory
 * answers with an array instead, and a symlink or submodule with another `type`.
 */
interface ContentPayloadFile {
  type?: string;
  size?: number;
  content?: string;
  encoding?: string;
}

/**
 * Contents-API payload → `RepoFileResult`. Pure: no I/O, so the decoding rules are
 * testable without Octokit. Checked in this order: a directory (array), null or a
 * non-object, a `type` other than `file` (symlink, submodule) or a non-numeric `size`
 * → `not_a_file`; a size above `maxBytes` → `too_large`; content that is absent or
 * decodes to nothing → `empty`; otherwise the decoded file. It never returns
 * `not_found`: a missing path is the caller's 404.
 */
export function toRepoFile(
  payload: unknown,
  path: string,
  ref: string,
  maxBytes: number,
): RepoFileResult {
  if (Array.isArray(payload) || payload === null || typeof payload !== 'object') {
    return { file: null, reason: 'not_a_file' };
  }
  const file = payload as ContentPayloadFile;
  if (file.type !== 'file') return { file: null, reason: 'not_a_file' };
  if (typeof file.size !== 'number') return { file: null, reason: 'not_a_file' };
  if (file.size > maxBytes) return { file: null, reason: 'too_large' };
  if (typeof file.content !== 'string') return { file: null, reason: 'empty' };
  const content =
    file.encoding === 'base64'
      ? Buffer.from(file.content, 'base64').toString('utf-8')
      : file.content;
  if (content.length === 0) return { file: null, reason: 'empty' };
  return { file: { path, ref, content, size: file.size } };
}
