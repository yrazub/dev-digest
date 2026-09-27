// File layout of a review run, and the finalize step shared by finalize.mjs and waive.mjs.
//
//   .devdigest/self-review/
//     latest.json                  { run_dir, base }
//     verdicts/<diff_hash>.json    the verdict the gate reads
//     runs/<stamp>-<head7>/
//       diff.json  plan.json  arch.json  waivers.json  verdict.json  report.md
//       patches/<task>.diff        what each reviewer sees
//       findings/<task>.json       what each reviewer wrote
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVerdict } from './verdict.mjs';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const stateDir = (root) => path.join(root, '.devdigest', 'self-review');

export function loadManifest() {
  return JSON.parse(readFileSync(path.join(SKILL_DIR, 'routing.json'), 'utf8'));
}

export const readJson = (file, fallback = null) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);

export function writeJson(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

/** `latest` or a path → an absolute run directory. */
export function resolveRunDir(root, arg) {
  if (!arg || arg === 'latest') {
    const latest = readJson(path.join(stateDir(root), 'latest.json'));
    if (!latest) throw new Error('No review run yet. Run prepare.mjs first.');
    return path.resolve(root, latest.run_dir);
  }
  return path.resolve(root, arg);
}

export function finalizeRun(root, runDir) {
  const diff = readJson(path.join(runDir, 'diff.json'));
  const plan = readJson(path.join(runDir, 'plan.json'));
  if (!diff || !plan) throw new Error(`${runDir} is not a review run (diff.json / plan.json missing).`);

  const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
  const outputs = {};
  const patches = {};
  for (const t of plan.tasks) {
    outputs[t.id] = read(path.join(runDir, 'findings', `${t.id}.json`));
    patches[t.id] = read(path.join(runDir, 'patches', `${t.id}.diff`)) ?? '';
  }

  const result = buildVerdict({
    plan,
    diff,
    outputs,
    patches,
    arch: readJson(path.join(runDir, 'arch.json')),
    waivers: readJson(path.join(runDir, 'waivers.json'), []),
  });

  const verdict = {
    ...result,
    base: diff.base,
    merge_base: diff.merge_base,
    head: diff.head,
    diff_hash: diff.diff_hash,
    dirty: diff.dirty,
    run_dir: path.relative(root, runDir),
    skills_run: [...new Set(plan.tasks.map((t) => t.skill))].concat(plan.arch_check ? ['arch-check'] : []),
    finalized_at: new Date().toISOString(),
  };
  writeJson(path.join(runDir, 'verdict.json'), verdict);
  writeJson(path.join(stateDir(root), 'verdicts', `${diff.diff_hash}.json`), verdict);
  const report = renderReport(verdict, plan, diff);
  writeFileSync(path.join(runDir, 'report.md'), report);
  return { verdict, report };
}

const loc = (f) => (f.line ? `${f.file}:${f.line}` : f.file);

function renderFinding(f) {
  const tags = [`\`${f.rule_id ?? 'no-rule'}\``, f.skills?.join(', ') ?? f.skill, ...(f.notes ?? [])].join(' · ');
  const lines = [`- **${f.id}** \`${loc(f)}\` — ${f.title}  \n  ${tags}`];
  if (f.waived) lines.push(`  Waived: ${f.waived.reason}`);
  if (f.evidence) lines.push(`  > ${f.evidence.split('\n')[0].slice(0, 160)}`);
  if (f.suggestion) lines.push(`  Fix: ${f.suggestion}`);
  return lines.join('\n');
}

export function renderReport(v, plan, diff) {
  const head = v.verdict === 'pass'
    ? `PASS${v.counts.waived ? ` (${v.counts.waived} CRITICAL waived)` : ''}`
    : `BLOCKED — ${v.reasons.map((r) => (r === 'critical' ? `${v.counts.CRITICAL} CRITICAL` : 'review incomplete')).join(', ')}`;
  const out = [
    `## PR self-review: ${head}`,
    '',
    `Base \`${v.base}\` (merge-base \`${v.merge_base.slice(0, 7)}\`) · HEAD \`${v.head.slice(0, 7)}\`` +
      ` · ${diff.files.length} files${v.dirty ? ' · includes uncommitted changes' : ''}`,
    '',
    '| CRITICAL | WARNING | SUGGESTION | waived |',
    '|---|---|---|---|',
    `| ${v.counts.CRITICAL} | ${v.counts.WARNING} | ${v.counts.SUGGESTION} | ${v.counts.waived} |`,
  ];

  const section = (title, list) => {
    if (!list.length) return;
    out.push('', `### ${title}`, '', ...list.map(renderFinding));
  };
  section('CRITICAL', v.findings.filter((f) => f.severity === 'CRITICAL' && !f.waived));
  section('Waived', v.findings.filter((f) => f.waived));
  section('WARNING', v.findings.filter((f) => f.severity === 'WARNING'));
  section('SUGGESTION', v.findings.filter((f) => f.severity === 'SUGGESTION'));

  out.push('', '### Coverage', '');
  out.push(`- Reviewers: ${v.skills_run.join(', ') || 'none'}`);
  if (v.failed_tasks.length) out.push(`- **Failed:** ${v.failed_tasks.map((t) => `${t.id} (${t.reason})`).join('; ')}`);
  if (plan.uncovered_files.length) {
    const shown = plan.uncovered_files.slice(0, 8).join(', ');
    const more = plan.uncovered_files.length > 8 ? ` and ${plan.uncovered_files.length - 8} more (plan.json)` : '';
    out.push(`- No skill covers ${plan.uncovered_files.length} file(s): ${shown}${more}`);
  }
  if (plan.unrouted_skills.length) out.push(`- Skills missing from routing.json: ${plan.unrouted_skills.join(', ')}`);
  if (plan.missing_skills.length) out.push(`- Routed but not installed: ${plan.missing_skills.join(', ')}`);
  if (v.dropped.length) out.push(`- Dropped ${v.dropped.length} finding(s) whose evidence is not in the diff`);
  return out.join('\n') + '\n';
}
