// Reads an Implementation Plan (the implementation-planner template) as Markdown.
// A phase is a `### <n> · <title>` heading under `## Phases`; it runs to the next `###` or `##`.
// Headings inside fenced code blocks are ignored.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/** `.devdigest/sdd/<feature>/` — local execution state, git-ignored. */
export const sddDir = (feature, root = REPO_ROOT) => path.join(root, '.devdigest', 'sdd', feature);

export const featureOf = (planPath) => path.basename(planPath, '.md');

export const planHash = (text) => createHash('sha256').update(text).digest('hex');

const PHASE = /^### (\d+) · (.+?)\s*$/;

/** Splits the plan into lines tagged with the `##` section and the phase they belong to. */
export function parsePlan(text) {
  const lines = text.split('\n');
  const phases = [];
  let section = null;
  let phase = null;
  let fence = null;
  const tagged = lines.map((line) => {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1].startsWith(fence[0]) && f[1].length >= fence.length) fence = null;
    } else if (!fence) {
      if (/^## /.test(line)) {
        section = line.slice(3).trim();
        phase = null;
      } else if (/^### /.test(line)) {
        const m = section === 'Phases' && line.match(PHASE);
        phase = m ? Number(m[1]) : null;
        if (m) phases.push({ n: phase, title: m[2] });
      }
    }
    return { line, section, phase };
  });
  const title = (lines.find((l) => /^# /.test(l)) ?? '').replace(/^# /, '').trim();
  const mode = text.match(/\*\*Execution mode:\*\*\s*(multi-agent|single-agent)/)?.[1] ?? null;
  return { title, mode, phases, tagged };
}

/** The plan without the other phases: every `##` section is kept, only `## Phases` is narrowed to phase n. */
export function slicePhase(text, n) {
  const plan = parsePlan(text);
  if (!plan.phases.some((p) => p.n === n)) {
    const known = plan.phases.map((p) => p.n).join(', ') || 'none';
    throw new Error(`Phase ${n} not found. Phases in this plan: ${known}.`);
  }
  return plan.tagged
    .filter((t) => t.phase === null || t.phase === n)
    .map((t) => t.line)
    .join('\n');
}

/** The body of one phase, for checks such as "test-writer only". */
export function phaseBody(text, n) {
  return parsePlan(text)
    .tagged.filter((t) => t.phase === n)
    .map((t) => t.line)
    .join('\n');
}
