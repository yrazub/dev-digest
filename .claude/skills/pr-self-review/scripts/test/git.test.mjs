import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectChanges, git, parseChangedLines, patchFor } from '../lib/git.mjs';

const exclude = ['**/*.md'];

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'pr-self-review-'));
  const run = (...args) => git(args, { cwd: root });
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 't@example.com');
  run('config', 'user.name', 'test');
  const write = (file, text) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  write('server/src/a.ts', 'one\ntwo\nthree\n');
  run('add', '.');
  run('commit', '-q', '-m', 'base');
  run('checkout', '-q', '-b', 'feature');
  return { root, run, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('uncommitted work, once committed unchanged, keeps the same hash; any edit changes it', () => {
  const r = repo();
  try {
    r.write('server/src/a.ts', 'one\nTWO\nthree\n');
    r.write('client/src/New.tsx', 'x\ny\n');
    r.write('README.md', 'docs');
    const working = collectChanges({ root: r.root, base: 'main', exclude, mode: 'working' });
    assert.deepEqual(working.files.map((f) => f.path).sort(), ['client/src/New.tsx', 'server/src/a.ts']);
    assert.deepEqual(working.excluded, ['README.md']);
    assert.deepEqual(working.files.find((f) => f.path === 'server/src/a.ts').changed_lines, [[2, 2]]);
    assert.deepEqual(working.files.find((f) => f.path === 'client/src/New.tsx').changed_lines, [[1, 2]]);

    const before = collectChanges({ root: r.root, base: 'main', exclude, mode: 'committed', withLines: false });
    assert.notEqual(before.diff_hash, working.diff_hash);

    r.run('add', 'server', 'client');
    r.run('commit', '-q', '-m', 'work');
    const committed = collectChanges({ root: r.root, base: 'main', exclude, mode: 'committed', withLines: false });
    assert.equal(committed.diff_hash, working.diff_hash);

    r.write('server/src/a.ts', 'one\nTWO\nthree\nfour\n');
    r.run('commit', '-qam', 'more');
    const after = collectChanges({ root: r.root, base: 'main', exclude, mode: 'committed', withLines: false });
    assert.notEqual(after.diff_hash, working.diff_hash);
  } finally {
    r.cleanup();
  }
});

test('patchFor includes untracked files', () => {
  const r = repo();
  try {
    r.write('server/src/new.ts', 'export const x = 1;\n');
    const c = collectChanges({ root: r.root, base: 'main', exclude, mode: 'working' });
    const patch = patchFor({ root: r.root, mergeBase: c.merge_base, files: c.files });
    assert.match(patch, /\+export const x = 1;/);
  } finally {
    r.cleanup();
  }
});

test('parseChangedLines reads the new-file ranges and skips pure deletions', () => {
  const d = '+++ b/x.ts\n@@ -1,0 +2,3 @@\n@@ -9,2 +12,0 @@\n@@ -20 +20 @@\n';
  assert.deepEqual(parseChangedLines(d), { 'x.ts': [[2, 4], [20, 20]] });
});
