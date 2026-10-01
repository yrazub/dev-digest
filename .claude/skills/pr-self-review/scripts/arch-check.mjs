#!/usr/bin/env node
// Step 2 of /pr-self-review: run `pnpm arch:check` and record the violations that are not in the
// baseline. Usage: node arch-check.mjs [run_dir|latest]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './lib/git.mjs';
import { resolveRunDir, writeJson } from './lib/run.mjs';

const root = repoRoot();
const runDir = resolveRunDir(root, process.argv[2]);
const serverDir = path.join(root, 'server');
const outFile = path.join(runDir, 'arch.json');

// depcruise reports paths relative to server/: `src/…` and `../reviewer-core/src/…`.
const toRepoPath = (p) => path.relative(root, path.resolve(serverDir, p));

function fail(error) {
  writeJson(outFile, { ran: false, error });
  console.log(JSON.stringify({ ran: false, error }));
  process.exit(0);
}

if (!existsSync(path.join(serverDir, 'node_modules', '.bin', 'depcruise'))) {
  fail('dependency-cruiser is not installed: cd server && pnpm install');
}

const res = spawnSync('pnpm', ['arch:check', '--output-type', 'json'], {
  cwd: serverDir,
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
});
const start = res.stdout?.indexOf('{') ?? -1;
if (start < 0) fail(`arch:check produced no JSON (exit ${res.status}): ${(res.stderr || '').trim().slice(0, 400)}`);

let summary;
try {
  summary = JSON.parse(res.stdout.slice(start)).summary;
} catch (e) {
  fail(`could not parse arch:check output: ${e.message}`);
}

const violations = summary.violations
  .filter((v) => v.rule.severity !== 'ignore')
  .map((v) => ({ rule: v.rule.name, severity: v.rule.severity, type: v.type, from: toRepoPath(v.from), to: toRepoPath(v.to) }));

writeJson(outFile, { ran: true, violations, baselined: summary.ignore });
console.log(JSON.stringify({ ran: true, new_violations: violations.length, baselined: summary.ignore }));
