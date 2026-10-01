import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from '../src/adapters/git/simple-git.js';

/**
 * SimpleGitClient.readFile never leaves the clone: a symlink committed to an
 * imported repo must not expose files elsewhere on the machine.
 */
describe('SimpleGitClient.readFile', () => {
  let base: string;
  const repo = { owner: 'acme', name: 'api' };

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'dd-git-read-'));
    const clone = join(base, 'clones', 'acme', 'api');
    await mkdir(join(clone, 'src'), { recursive: true });
    await writeFile(join(clone, 'src', 'a.ts'), 'export const a = 1;\n');
    await writeFile(join(base, 'secrets.json'), '{"OPENAI_API_KEY":"sk-test"}');
    await symlink(join(base, 'secrets.json'), join(clone, 'tsconfig.json'));
    await symlink(join(clone, 'src', 'a.ts'), join(clone, 'alias.ts'));
  });

  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('reads a file inside the clone', async () => {
    const git = new SimpleGitClient(join(base, 'clones'));
    expect(await git.readFile(repo, 'src/a.ts')).toBe('export const a = 1;\n');
  });

  it('follows a symlink that stays inside the clone', async () => {
    const git = new SimpleGitClient(join(base, 'clones'));
    expect(await git.readFile(repo, 'alias.ts')).toBe('export const a = 1;\n');
  });

  it('refuses a symlink that points outside the clone', async () => {
    const git = new SimpleGitClient(join(base, 'clones'));
    await expect(git.readFile(repo, 'tsconfig.json')).rejects.toThrow(/outside the clone/);
  });

  it('refuses a ../ path', async () => {
    const git = new SimpleGitClient(join(base, 'clones'));
    await expect(git.readFile(repo, '../../../secrets.json')).rejects.toThrow(/outside the clone/);
  });
});
