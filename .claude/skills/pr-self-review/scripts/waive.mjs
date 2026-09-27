#!/usr/bin/env node
// Waives one CRITICAL of the latest run, on the user's explicit request only.
// Usage: node waive.mjs <finding-id> --reason "<why>" [--run <run_dir>]
//
// A waiver lives in that run's waivers.json and nowhere else. Any change to the reviewed files
// changes the diff hash, so the verdict goes stale and the next run starts with no waivers.
import path from 'node:path';
import { collectChanges, repoRoot } from './lib/git.mjs';
import { finalizeRun, loadManifest, readJson, resolveRunDir, writeJson } from './lib/run.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const id = args[0];
const reason = opt('--reason');
if (!id || !reason?.trim()) {
  console.error('Usage: node waive.mjs <finding-id> --reason "<why>" [--run <run_dir>]');
  process.exit(1);
}

const root = repoRoot();
const runDir = resolveRunDir(root, opt('--run'));
const diff = readJson(path.join(runDir, 'diff.json'));
const verdict = readJson(path.join(runDir, 'verdict.json'));
if (!verdict) {
  console.error('This run has no verdict yet. Run finalize.mjs first.');
  process.exit(1);
}

const now = collectChanges({ root, base: diff.base, exclude: loadManifest().exclude, mode: 'working', withLines: false });
if (now.diff_hash !== diff.diff_hash) {
  console.error('The files changed since this review. Waivers do not carry over: run /pr-self-review again.');
  process.exit(1);
}

const finding = verdict.findings.find((f) => f.id === id);
if (!finding) { console.error(`No finding ${id} in this run.`); process.exit(1); }
if (finding.severity !== 'CRITICAL') { console.error(`${id} is ${finding.severity}; only a CRITICAL blocks, so only a CRITICAL can be waived.`); process.exit(1); }
if (finding.waived) { console.error(`${id} is already waived.`); process.exit(1); }

const waiversFile = path.join(runDir, 'waivers.json');
const waivers = readJson(waiversFile, []);
waivers.push({ rule_id: finding.rule_id, file: finding.file, line: finding.line, reason: reason.trim(), waived_at: new Date().toISOString() });
writeJson(waiversFile, waivers);

const { verdict: next, report } = finalizeRun(root, runDir);
console.log(report);
console.log(`VERDICT ${next.verdict} ${JSON.stringify({ counts: next.counts, failed_tasks: next.failed_tasks })}`);
