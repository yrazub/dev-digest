#!/usr/bin/env node
// Step 1 of /pr-self-review: collect the diff, route files to skills, write the run directory.
// Usage: node prepare.mjs [--base <ref>]
// Prints a JSON summary on stdout. `"status": "empty"` means there is nothing to review.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { collectChanges, patchFor, repoRoot } from './lib/git.mjs';
import { buildPlan, discoverSkills, packageOf } from './lib/routing.mjs';
import { SKILL_DIR, loadManifest, stateDir, writeJson } from './lib/run.mjs';

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const manifest = loadManifest();
const base = baseIdx >= 0 ? args[baseIdx + 1] : manifest.defaults.base;

const root = repoRoot();
const diff = collectChanges({ root, base, exclude: manifest.exclude, mode: 'working' });
const committed = collectChanges({ root, base, exclude: manifest.exclude, mode: 'committed', withLines: false });
diff.dirty = diff.diff_hash !== committed.diff_hash;

if (diff.files.length === 0) {
  console.log(JSON.stringify({ status: 'empty', base, merge_base: diff.merge_base, excluded: diff.excluded }, null, 2));
  process.exit(0);
}

const plan = buildPlan({ files: diff.files, manifest, installed: discoverSkills(path.join(root, '.claude', 'skills')) });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(stateDir(root), 'runs', `${stamp}-${diff.head.slice(0, 7)}`);
mkdirSync(path.join(runDir, 'patches'), { recursive: true });
mkdirSync(path.join(runDir, 'findings'), { recursive: true });
mkdirSync(path.join(runDir, 'prompts'), { recursive: true });

// The reviewer prompt, filled per task, so the orchestrator only has to point a subagent at it.
const template = readFileSync(path.join(SKILL_DIR, 'references', 'reviewer-prompt.md'), 'utf8').split('\n---\n')[1].trim();
const code = (xs) => xs.map((x) => `\`${x}\``).join(', ');

const byPath = new Map(diff.files.map((f) => [f.path, f]));
for (const t of plan.tasks) {
  t.patch_path = path.relative(root, path.join(runDir, 'patches', `${t.id}.diff`));
  t.findings_path = path.relative(root, path.join(runDir, 'findings', `${t.id}.json`));
  t.prompt_path = path.relative(root, path.join(runDir, 'prompts', `${t.id}.md`));
  const prompt = template
    .replaceAll('{skill_path}', t.skill_path)
    .replaceAll('{skill_name}', t.skill)
    .replaceAll('{patch_path}', t.patch_path)
    .replaceAll('{files}', code(t.files))
    .replaceAll('{critical_rules}', t.critical_rules.length ? code(t.critical_rules) : '(none)')
    .replaceAll('{findings_path}', t.findings_path);
  writeFileSync(path.join(root, t.prompt_path), prompt + '\n');
  writeFileSync(path.join(root, t.patch_path), patchFor({ root, mergeBase: diff.merge_base, files: t.files.map((p) => byPath.get(p)) }));
}

writeJson(path.join(runDir, 'diff.json'), diff);
writeJson(path.join(runDir, 'plan.json'), plan);
writeJson(path.join(stateDir(root), 'latest.json'), { run_dir: path.relative(root, runDir), base });

const byPackage = {};
for (const f of diff.files) (byPackage[packageOf(f.path)] ??= []).push(`${f.status} ${f.path}`);

console.log(JSON.stringify({
  status: 'ready',
  run_dir: path.relative(root, runDir),
  base,
  merge_base: diff.merge_base.slice(0, 7),
  head: diff.head.slice(0, 7),
  dirty: diff.dirty,
  files: byPackage,
  excluded: diff.excluded.length,
  arch_check: plan.arch_check,
  tasks: plan.tasks.map(({ id, skill, model, can_block, files, prompt_path, findings_path }) => ({
    id, skill, model, can_block, files: files.length, prompt_path, findings_path,
  })),
  warnings: {
    uncovered_files: plan.uncovered_files,
    unrouted_skills: plan.unrouted_skills,
    missing_skills: plan.missing_skills,
  },
}, null, 2));
