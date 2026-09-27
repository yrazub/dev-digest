// The git pre-push hook on a throwaway repository: which pushes it lets through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from '../lib/git.mjs';

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZERO = '0'.repeat(40);

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'pr-self-review-prepush-'));
  const run = (...args) => git(args, { cwd: root });
  const write = (file, text) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  const node = (script, args = [], input) =>
    spawnSync('node', [path.join(SCRIPTS, script), ...args], { cwd: root, encoding: 'utf8', input });
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 't@example.com');
  run('config', 'user.name', 'test');
  write('.claude/skills/frontend-ui-architecture/SKILL.md', '---\nname: frontend-ui-architecture\n---\n');
  write('client/src/Card.tsx', 'export const Card = () => null;\n');
  run('add', '.');
  run('commit', '-q', '-m', 'base');
  // Before any review the base is the manifest default, origin/main — as in a real clone.
  run('update-ref', 'refs/remotes/origin/main', 'main');
  run('checkout', '-q', '-b', 'feature');

  const commit = (file, text) => { write(file, text); run('add', '-A'); run('commit', '-q', '-m', file); return run('rev-parse', 'HEAD').trim(); };
  /** Review the committed branch against main; `critical` makes the verdict blocked. */
  const review = ({ critical = false } = {}) => {
    const prep = JSON.parse(node('prepare.mjs', ['--base', 'main']).stdout);
    for (const t of prep.tasks) {
      const findings = critical && t.skill === 'frontend-ui-architecture' ? [{
        rule_id: 'split-no-nested-definitions', severity: 'CRITICAL', file: 'client/src/Card.tsx', line: 2,
        title: 'Component defined inside a component', evidence: 'const Inner = () => null;', suggestion: 'Hoist it.',
      }] : [];
      writeFileSync(path.join(root, t.findings_path), JSON.stringify({ findings }));
    }
    return node('finalize.mjs').stdout;
  };
  const prePush = (lines) => node('pre-push.mjs', ['origin', 'git@example.com:x.git'], lines.join('\n') + '\n');
  return { root, run, write, commit, review, prePush, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('pre-push denies unreviewed commits and allows them once the review passes', () => {
  const r = setup();
  try {
    const sha = r.commit('client/src/Card.tsx', 'export const Card = () => 1;\n');
    const line = `refs/heads/feature ${sha} refs/heads/feature ${ZERO}`;

    const before = r.prePush([line]);
    assert.equal(before.status, 1);
    assert.match(before.stderr, /commits on feature .*have not been reviewed/);

    assert.match(r.review(), /VERDICT pass/);
    assert.equal(r.prePush([line]).status, 0);

    // A new commit after the review makes it stale again.
    const later = r.commit('client/src/Card.tsx', 'export const Card = () => 2;\n');
    assert.equal(r.prePush([`refs/heads/feature ${later} refs/heads/feature ${sha}`]).status, 1);
  } finally {
    r.cleanup();
  }
});

test('pre-push denies a blocked review and lists its CRITICALs', () => {
  const r = setup();
  try {
    const sha = r.commit('client/src/Card.tsx', 'export const Card = () => {\n  const Inner = () => null;\n  return <Inner />;\n};\n');
    assert.match(r.review({ critical: true }), /VERDICT blocked/);
    const res = r.prePush([`refs/heads/feature ${sha} refs/heads/feature ${ZERO}`]);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /BLOCKED[\s\S]*split-no-nested-definitions/);
  } finally {
    r.cleanup();
  }
});

test('pre-push judges the pushed commit, not the checked-out one', () => {
  const r = setup();
  try {
    r.run('checkout', '-q', '-b', 'other');
    const otherSha = r.commit('client/src/Other.tsx', 'export const Other = () => null;\n');
    r.run('checkout', '-q', 'feature');
    const featureSha = r.commit('client/src/Card.tsx', 'export const Card = () => 1;\n');
    assert.match(r.review(), /VERDICT pass/);

    assert.equal(r.prePush([`refs/heads/feature ${featureSha} refs/heads/feature ${ZERO}`]).status, 0);
    const other = r.prePush([`refs/heads/other ${otherSha} refs/heads/other ${ZERO}`]);
    assert.equal(other.status, 1);
    assert.match(other.stderr, /commits on other/);
  } finally {
    r.cleanup();
  }
});

test('pre-push lets deletions, tags and empty input through', () => {
  const r = setup();
  try {
    const sha = r.commit('client/src/Card.tsx', 'export const Card = () => 1;\n');
    assert.equal(r.prePush([`(delete) ${ZERO} refs/heads/old ${sha}`]).status, 0);
    assert.equal(r.prePush([`refs/tags/v1 ${sha} refs/tags/v1 ${ZERO}`]).status, 0);
    assert.equal(r.prePush([]).status, 0);
  } finally {
    r.cleanup();
  }
});

test('a real git push runs the hook through core.hooksPath', () => {
  const r = setup();
  const remote = mkdtempSync(path.join(tmpdir(), 'pr-self-review-remote-'));
  try {
    git(['init', '-q', '--bare'], { cwd: remote });
    r.run('remote', 'add', 'origin', remote);
    r.write('.githooks/pre-push', `#!/bin/sh\nexec node "${path.join(SCRIPTS, 'pre-push.mjs')}" "$@"\n`);
    chmodSync(path.join(r.root, '.githooks/pre-push'), 0o755);
    r.run('config', 'core.hooksPath', '.githooks');
    r.commit('client/src/Card.tsx', 'export const Card = () => 1;\n');

    const denied = spawnSync('git', ['push', '-q', 'origin', 'feature'], { cwd: r.root, encoding: 'utf8' });
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /pr-self-review pre-push: .*have not been reviewed/);

    assert.match(r.review(), /VERDICT pass/);
    const allowed = spawnSync('git', ['push', '-q', 'origin', 'feature'], { cwd: r.root, encoding: 'utf8' });
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.equal(git(['rev-parse', 'feature'], { cwd: remote }).trim(), r.run('rev-parse', 'feature').trim());
  } finally {
    r.cleanup();
    rmSync(remote, { recursive: true, force: true });
  }
});
