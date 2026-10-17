import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsCloneFiles } from '../src/adapters/clone-files/index.js';
import { MockCloneFiles } from '../src/adapters/mocks.js';

/**
 * FsCloneFiles lists a clone's regular files without following links and reads
 * one as UTF-8 text without ever leaving the clone (R-SRV-3/4, EC-10, NFR-5).
 */
const repo = { owner: 'acme', name: 'api' };
const EXCLUDED = ['node_modules', 'vendor', '.git'];
// A file without read permission is only unreadable for a non-root user on POSIX.
const canDenyRead = process.platform !== 'win32' && process.getuid?.() !== 0;

describe('FsCloneFiles', () => {
  let base: string;
  let files: FsCloneFiles;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'dd-clone-files-'));
    const clone = join(base, 'clones', 'acme', 'api');
    await mkdir(join(clone, 'docs'), { recursive: true });
    await mkdir(join(clone, 'node_modules', 'docs'), { recursive: true });
    await mkdir(join(clone, 'vendor', 'specs'), { recursive: true });
    await mkdir(join(clone, '.git'), { recursive: true });
    await mkdir(join(clone, 'real-dir'), { recursive: true });

    await writeFile(join(clone, 'docs', 'a.md'), '# A\n');
    await writeFile(join(clone, 'README.md'), 'héllo'); // 6 bytes, 5 chars
    await writeFile(join(clone, 'node_modules', 'docs', 'a.md'), 'x');
    await writeFile(join(clone, 'vendor', 'specs', 'b.md'), 'x');
    await writeFile(join(clone, '.git', 'config'), 'x');
    await writeFile(join(clone, 'real-dir', 'inner.md'), 'inner');

    // Links: a file link and a directory link inside the clone, one escaping file link.
    await symlink(join(clone, 'docs', 'a.md'), join(clone, 'linked.md'));
    await symlink(join(clone, 'real-dir'), join(clone, 'linked-dir'));
    await writeFile(join(base, 'secrets.md'), 'TOP SECRET');
    await symlink(join(base, 'secrets.md'), join(clone, 'escape.md'));
    // A loop and a dangling link.
    await symlink(join(clone, 'loop-b.md'), join(clone, 'loop-a.md'));
    await symlink(join(clone, 'loop-a.md'), join(clone, 'loop-b.md'));
    await symlink(join(clone, 'missing.md'), join(clone, 'dangling.md'));

    await writeFile(join(clone, 'bad-utf8.md'), Buffer.from([0x68, 0xff, 0xfe, 0x69]));
    await writeFile(join(clone, 'big.md'), 'x'.repeat(100));

    // A clone "directory" that is a regular file.
    await mkdir(join(base, 'clones', 'acme'), { recursive: true });
    await writeFile(join(base, 'clones', 'acme', 'not-a-dir'), 'x');

    files = new FsCloneFiles(join(base, 'clones'));
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  describe('list', () => {
    async function paths() {
      const res = await files.list(repo, { excludedDirs: EXCLUDED });
      if (res.kind !== 'entries') throw new Error('expected entries');
      return res.entries;
    }

    it('returns "/"-separated relative paths with byte sizes', async () => {
      const entries = await paths();
      expect(entries).toContainEqual({ path: 'docs/a.md', size: 4 });
      expect(entries).toContainEqual({ path: 'README.md', size: 6 });
      expect(entries).toContainEqual({ path: 'real-dir/inner.md', size: 5 });
      expect(entries.every((e) => !e.path.includes('\\'))).toBe(true);
    });

    it('skips excluded directories at any depth', async () => {
      const list = (await paths()).map((e) => e.path);
      expect(list).not.toContain('node_modules/docs/a.md');
      expect(list).not.toContain('vendor/specs/b.md');
      expect(list.some((p) => p.startsWith('.git/'))).toBe(false);
    });

    it('skips a symlinked file and a symlinked directory', async () => {
      const list = (await paths()).map((e) => e.path);
      expect(list).not.toContain('linked.md');
      expect(list).not.toContain('escape.md');
      expect(list).not.toContain('dangling.md');
      expect(list.some((p) => p.startsWith('linked-dir/'))).toBe(false);
      // the real directory behind the link is still listed once
      expect(list.filter((p) => p === 'real-dir/inner.md')).toHaveLength(1);
    });

    it('answers not_cloned for a missing clone directory', async () => {
      const res = await files.list({ owner: 'acme', name: 'nope' }, { excludedDirs: EXCLUDED });
      expect(res).toEqual({ kind: 'not_cloned' });
    });

    it('answers not_cloned when the clone path is not a directory', async () => {
      const res = await files.list({ owner: 'acme', name: 'not-a-dir' }, { excludedDirs: EXCLUDED });
      expect(res).toEqual({ kind: 'not_cloned' });
    });
  });

  describe('read', () => {
    const opts = { maxBytes: 50 };

    it('returns the text of a valid file', async () => {
      expect(await files.read(repo, 'docs/a.md', opts)).toEqual({ kind: 'text', text: '# A\n' });
      expect(await files.read(repo, 'README.md', opts)).toEqual({ kind: 'text', text: 'héllo' });
    });

    it('follows a symlink that stays inside the clone', async () => {
      expect(await files.read(repo, 'linked.md', opts)).toEqual({ kind: 'text', text: '# A\n' });
    });

    it('answers not_found for a missing path, a dangling link, a link loop and a directory', async () => {
      const miss = { kind: 'miss', miss: 'not_found' };
      expect(await files.read(repo, 'docs/missing.md', opts)).toEqual(miss);
      expect(await files.read(repo, 'dangling.md', opts)).toEqual(miss);
      expect(await files.read(repo, 'loop-a.md', opts)).toEqual(miss);
      expect(await files.read(repo, 'docs', opts)).toEqual(miss);
    });

    it('answers too_large for a file over maxBytes', async () => {
      expect(await files.read(repo, 'big.md', opts)).toEqual({ kind: 'miss', miss: 'too_large' });
      expect(await files.read(repo, 'big.md', { maxBytes: 100 })).toMatchObject({ kind: 'text' });
    });

    it.skipIf(!canDenyRead)('answers too_large without reading the file', async () => {
      const path = join(base, 'clones', 'acme', 'api', 'locked.md');
      await writeFile(path, 'y'.repeat(100));
      await chmod(path, 0o000);
      try {
        // Reading it would throw EACCES; a size check first answers too_large.
        expect(await files.read(repo, 'locked.md', opts)).toEqual({ kind: 'miss', miss: 'too_large' });
      } finally {
        await chmod(path, 0o644);
      }
    });

    it('answers unreadable for bytes that are not valid UTF-8', async () => {
      expect(await files.read(repo, 'bad-utf8.md', opts)).toEqual({ kind: 'miss', miss: 'unreadable' });
    });

    it('answers outside_clone for a symlink to a file outside the clone (EC-10)', async () => {
      expect(await files.read(repo, 'escape.md', opts)).toEqual({ kind: 'miss', miss: 'outside_clone' });
    });

    it('answers outside_clone for a ../ path', async () => {
      expect(await files.read(repo, '../../../secrets.md', opts)).toEqual({
        kind: 'miss',
        miss: 'outside_clone',
      });
    });

    it('answers not_cloned for a missing clone directory', async () => {
      const res = await files.read({ owner: 'acme', name: 'nope' }, 'docs/a.md', opts);
      expect(res).toEqual({ kind: 'not_cloned' });
    });

    it('answers not_cloned when the clone path is not a directory', async () => {
      const res = await files.read({ owner: 'acme', name: 'not-a-dir' }, 'x.md', opts);
      expect(res).toEqual({ kind: 'not_cloned' });
    });
  });
});

describe('MockCloneFiles', () => {
  const opts = { excludedDirs: ['node_modules'] };

  it('lists entries, dropping symlinks and excluded folders; size defaults to the UTF-8 byte length', async () => {
    const mock = new MockCloneFiles({
      files: {
        'docs/a.md': 'héllo', // a plain string is a file entry
        'docs/b.md': { text: 'x', size: 99 },
        'docs/link.md': { text: 'x', symlink: true },
        'node_modules/docs/c.md': 'x',
      },
    });
    const res = await mock.list({ owner: 'o', name: 'n' }, opts);
    expect(res).toEqual({
      kind: 'entries',
      entries: [
        { path: 'docs/a.md', size: 6 },
        { path: 'docs/b.md', size: 99 },
      ],
    });
  });

  it('reads text, the configured miss, too_large, not_found, and records every read path', async () => {
    const mock = new MockCloneFiles({
      files: {
        'a.md': 'text',
        'b.md': { miss: 'unreadable' },
        'c.md': { text: 'x', size: 10 },
      },
    });
    const repoRef = { owner: 'o', name: 'n' };
    expect(await mock.read(repoRef, 'a.md', { maxBytes: 10 })).toEqual({ kind: 'text', text: 'text' });
    expect(await mock.read(repoRef, 'b.md', { maxBytes: 10 })).toEqual({ kind: 'miss', miss: 'unreadable' });
    expect(await mock.read(repoRef, 'c.md', { maxBytes: 9 })).toEqual({ kind: 'miss', miss: 'too_large' });
    expect(await mock.read(repoRef, 'zz.md', { maxBytes: 10 })).toEqual({ kind: 'miss', miss: 'not_found' });
    expect(mock.reads).toEqual(['a.md', 'b.md', 'c.md', 'zz.md']);
  });

  it('answers not_cloned for both operations when cloned is false', async () => {
    const mock = new MockCloneFiles({ cloned: false, files: { 'a.md': 'x' } });
    const repoRef = { owner: 'o', name: 'n' };
    expect(await mock.list(repoRef, opts)).toEqual({ kind: 'not_cloned' });
    expect(await mock.read(repoRef, 'a.md', { maxBytes: 10 })).toEqual({ kind: 'not_cloned' });
  });
});
