// The whole cycle on a throwaway repository: prepare → reviewer output → finalize → gate → waive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from '../lib/git.mjs';

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'pr-self-review-cli-'));
  const run = (...args) => git(args, { cwd: root });
  const write = (file, text) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 't@example.com');
  run('config', 'user.name', 'test');
  write('.claude/skills/frontend-ui-architecture/SKILL.md', '---\nname: frontend-ui-architecture\n---\n');
  write('client/src/Card.tsx', 'export const Card = () => null;\n');
  run('add', '.');
  run('commit', '-q', '-m', 'base');
  run('checkout', '-q', '-b', 'feature');

  const node = (script, args = [], input) =>
    spawnSync('node', [path.join(SCRIPTS, script), ...args], { cwd: root, encoding: 'utf8', input });
  const gate = () => node('gate.mjs', [], JSON.stringify({ cwd: root, tool_input: { command: 'gh pr create --fill' } }));
  return { root, run, write, node, gate, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('a CRITICAL blocks the PR; a waiver releases it; any later change resets it', () => {
  const r = setup();
  try {
    r.write('client/src/Card.tsx', 'export const Card = () => {\n  const Inner = () => null;\n  return <Inner />;\n};\n');

    const prep = JSON.parse(r.node('prepare.mjs', ['--base', 'main']).stdout);
    assert.equal(prep.status, 'ready');
    const task = prep.tasks.find((t) => t.skill === 'frontend-ui-architecture');
    assert.ok(task, 'frontend-ui-architecture reviews the client file');

    for (const t of prep.tasks) {
      const findings = t.id !== task.id ? [] : [{
        rule_id: 'split-no-nested-definitions',
        severity: 'CRITICAL',
        file: 'client/src/Card.tsx',
        line: 2,
        title: 'Component defined inside a component',
        evidence: 'const Inner = () => null;',
        suggestion: 'Move Inner to module scope.',
      }];
      writeFileSync(path.join(r.root, t.findings_path), JSON.stringify({ findings }));
    }

    const fin = r.node('finalize.mjs');
    assert.match(fin.stdout, /VERDICT blocked/);

    // Nothing committed yet: a PR would be empty, so there is nothing to gate.
    assert.equal(r.gate().status, 0);

    // Committing exactly the reviewed work keeps the verdict: same content, same hash.
    r.run('commit', '-qam', 'card');
    const blocked = r.gate();
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /BLOCKED[\s\S]*split-no-nested-definitions/);

    const waive = r.node('waive.mjs', ['F1', '--reason', 'intentional for the test']);
    assert.match(waive.stdout, /VERDICT pass/);
    assert.equal(r.gate().status, 0);

    const verdict = JSON.parse(readFileSync(path.join(r.root, prep.run_dir, 'verdict.json'), 'utf8'));
    assert.equal(verdict.findings[0].waived.reason, 'intentional for the test');

    r.write('client/src/Card.tsx', 'export const Card = () => {\n  const Inner = () => null;\n  return <Inner />; // edited\n};\n');
    r.run('commit', '-qam', 'edit');
    const stale = r.gate();
    assert.equal(stale.status, 2);
    assert.match(stale.stderr, /have not been reviewed/);

    const late = r.node('waive.mjs', ['F1', '--reason', 'again']);
    assert.notEqual(late.status, 0);
    assert.match(late.stderr, /changed since this review/);
  } finally {
    r.cleanup();
  }
});

test('the gate ignores every command except git push and gh pr create', () => {
  const r = setup();
  try {
    const res = r.node('gate.mjs', [], JSON.stringify({ cwd: r.root, tool_input: { command: 'git status' } }));
    assert.equal(res.status, 0);
  } finally {
    r.cleanup();
  }
});

test('the gate also denies git push of unreviewed commits', () => {
  const r = setup();
  try {
    r.write('server/src/modules/x/routes.ts', 'export const x = 1;\n');
    r.node('prepare.mjs', ['--base', 'main']);
    r.run('add', '-A');
    r.run('commit', '-qm', 'x');
    const res = r.node('gate.mjs', [], JSON.stringify({ cwd: r.root, tool_input: { command: 'git push origin feature' } }));
    assert.equal(res.status, 2);
    assert.match(res.stderr, /have not been reviewed/);
  } finally {
    r.cleanup();
  }
});
