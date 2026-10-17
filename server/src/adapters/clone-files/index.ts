/**
 * clone-files adapter — the only file-system access of the Project Context feature.
 *
 * Lists the regular files of a repository's clone and reads one of them as UTF-8
 * text. It applies no business rule (search roots, extension, token cap): the
 * caller decides what a document is. It never follows a symbolic link in the
 * walk, and a read never leaves the clone directory (`realpath` on both ends).
 *
 * The clone directory is `join(cloneDir, owner, name)`, the same rule as
 * `GitClient.clonePathFor`. A missing clone directory is reported as
 * `not_cloned`, separately from a file miss.
 *
 * The port is declared here, as `Tokenizer` and `HttpFetcher` are; the module
 * that uses it repeats the shape structurally, because an adapter may not import
 * a module and a module may not import an adapter. Swappable in tests via
 * ContainerOverrides.cloneFiles.
 */
import { lstat, open, readdir, realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { RepoRef } from '@devdigest/shared';

export interface CloneFileEntry {
  path: string;
  size: number;
}

export type CloneFileMiss = 'not_found' | 'too_large' | 'unreadable' | 'outside_clone';

export type CloneListResult =
  | { kind: 'not_cloned' }
  | { kind: 'entries'; entries: CloneFileEntry[] };

export type CloneReadResult =
  | { kind: 'not_cloned' }
  | { kind: 'text'; text: string }
  | { kind: 'miss'; miss: CloneFileMiss };

export interface CloneFiles {
  list(repo: RepoRef, opts: { excludedDirs: readonly string[] }): Promise<CloneListResult>;
  read(repo: RepoRef, path: string, opts: { maxBytes: number }): Promise<CloneReadResult>;
}

function errCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | null)?.code;
}

/** Errors that mean "nothing is there (any more)": a miss, not a failure. */
function isAbsent(err: unknown): boolean {
  const code = errCode(err);
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'ELOOP';
}

export class FsCloneFiles implements CloneFiles {
  constructor(private cloneDir: string) {}

  private dirFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  /** `realpath` of the clone directory, or null when it does not exist. */
  private async rootOf(repo: RepoRef): Promise<string | null> {
    try {
      const root = await realpath(this.dirFor(repo));
      return (await stat(root)).isDirectory() ? root : null;
    } catch (err) {
      if (isAbsent(err)) return null;
      throw err;
    }
  }

  async list(repo: RepoRef, opts: { excludedDirs: readonly string[] }): Promise<CloneListResult> {
    const root = await this.rootOf(repo);
    if (!root) return { kind: 'not_cloned' };
    const excluded = new Set(opts.excludedDirs);
    const entries: CloneFileEntry[] = [];

    const walk = async (abs: string, rel: string): Promise<void> => {
      let dirents;
      try {
        dirents = await readdir(abs, { withFileTypes: true });
      } catch (err) {
        if (isAbsent(err)) return; // removed while walking
        throw err;
      }
      for (const d of dirents) {
        if (d.isSymbolicLink()) continue;
        const childAbs = join(abs, d.name);
        const childRel = rel ? `${rel}/${d.name}` : d.name;
        if (d.isDirectory()) {
          if (excluded.has(d.name)) continue;
          await walk(childAbs, childRel);
        } else if (d.isFile()) {
          try {
            const st = await lstat(childAbs);
            if (st.isFile()) entries.push({ path: childRel, size: st.size });
          } catch (err) {
            if (!isAbsent(err)) throw err;
          }
        }
      }
    };

    await walk(root, '');
    return { kind: 'entries', entries };
  }

  async read(repo: RepoRef, path: string, opts: { maxBytes: number }): Promise<CloneReadResult> {
    const root = await this.rootOf(repo);
    if (!root) return { kind: 'not_cloned' };

    let target: string;
    try {
      target = await realpath(join(root, path));
    } catch (err) {
      if (isAbsent(err)) return { kind: 'miss', miss: 'not_found' };
      throw err;
    }
    if (target !== root && !target.startsWith(root + sep)) {
      return { kind: 'miss', miss: 'outside_clone' };
    }

    try {
      const st = await stat(target);
      if (!st.isFile()) return { kind: 'miss', miss: 'not_found' };
      if (st.size > opts.maxBytes) return { kind: 'miss', miss: 'too_large' };
      const handle = await open(target, 'r');
      let bytes: Buffer;
      try {
        // Read at most maxBytes + 1 so a file that grew since the stat is still bounded.
        const buf = Buffer.alloc(opts.maxBytes + 1);
        const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
        bytes = buf.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
      if (bytes.length > opts.maxBytes) return { kind: 'miss', miss: 'too_large' };
      try {
        return { kind: 'text', text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
      } catch {
        return { kind: 'miss', miss: 'unreadable' };
      }
    } catch (err) {
      if (isAbsent(err)) return { kind: 'miss', miss: 'not_found' };
      throw err;
    }
  }
}
