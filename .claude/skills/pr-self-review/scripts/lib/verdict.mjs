// Pure logic: validate the reviewers' output, apply the CRITICAL bar, and decide the verdict.
// No I/O here, so every rule is unit-tested in ../test/verdict.test.mjs.

export const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];
const RANK = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };
// A reviewer may be a couple of lines off when it points at a changed line.
const LINE_SLACK = 2;

const collapse = (s) => s.replace(/\s+/g, ' ').trim();

/** The patch text with the diff markers stripped, whitespace-collapsed, for evidence lookup. */
export function patchCorpus(patch) {
  return collapse(
    patch
      .split('\n')
      .filter((l) => !l.startsWith('+++') && !l.startsWith('---') && !l.startsWith('@@') && !l.startsWith('diff ') && !l.startsWith('index '))
      .map((l) => (/^[+\- ]/.test(l) ? l.slice(1) : l))
      .join('\n'),
  );
}

export function evidenceInPatch(evidence, corpus) {
  const quote = collapse(evidence.split('\n').map((l) => l.replace(/^[+\- ]/, '')).join('\n'));
  return quote.length > 0 && corpus.includes(quote);
}

export function inChangedLines(line, ranges = []) {
  if (!Number.isInteger(line)) return false;
  return ranges.some(([a, b]) => line >= a - LINE_SLACK && line <= b + LINE_SLACK);
}

/** Returns an error message, or null when the finding has the required shape. */
export function shapeError(f, task) {
  if (!f || typeof f !== 'object') return 'finding is not an object';
  if (!SEVERITIES.includes(f.severity)) return `severity must be one of ${SEVERITIES.join(', ')}`;
  if (typeof f.file !== 'string' || !task.files.includes(f.file)) return `file "${f.file}" is not one of this task's files`;
  if (f.line != null && !(Number.isInteger(f.line) && f.line >= 1)) return 'line must be a positive integer or null';
  for (const key of ['title', 'evidence']) if (typeof f[key] !== 'string' || !f[key].trim()) return `${key} is required`;
  if (f.severity === 'CRITICAL' && (typeof f.rule_id !== 'string' || !f.rule_id)) return 'a CRITICAL needs a rule_id';
  if (f.severity === 'CRITICAL' && !Number.isInteger(f.line)) return 'a CRITICAL needs a line';
  return null;
}

/** Parses one reviewer's output file. Returns { findings } or { error }. */
export function parseTaskOutput(raw, task) {
  if (raw == null) return { error: 'no findings file was written' };
  let data;
  try { data = JSON.parse(raw); } catch (e) { return { error: `invalid JSON: ${e.message}` }; }
  const list = Array.isArray(data) ? data : data?.findings;
  if (!Array.isArray(list)) return { error: 'expected { "findings": [...] }' };
  for (const [i, f] of list.entries()) {
    const err = shapeError(f, task);
    if (err) return { error: `findings[${i}]: ${err}` };
  }
  return { findings: list };
}

export const fingerprint = (f) => `${f.rule_id ?? ''}|${f.file}|${f.line ?? ''}`;

function archFindings(arch, changedPaths) {
  return (arch?.violations ?? []).map((v) => {
    const inDiff = changedPaths.has(v.from);
    return {
      skill: 'arch-check',
      rule_id: `dep-cruiser/${v.rule}`,
      severity: inDiff ? 'CRITICAL' : 'WARNING',
      file: v.from,
      line: null,
      title: inDiff
        ? `New dependency-cruiser violation: ${v.rule}`
        : `New dependency-cruiser violation in a file this diff does not touch: ${v.rule}`,
      evidence: `${v.from} → ${v.to}`,
      suggestion: 'See .claude/skills/onion-architecture/references/enforcement-dependency-cruiser.md. Do not re-baseline to silence it.',
      deterministic: true,
      notes: inDiff ? [] : ['not in this diff'],
    };
  });
}

/**
 * @param plan      plan.json ({ tasks, arch_check, ... })
 * @param diff      diff.json (files with changed_lines)
 * @param outputs   { [taskId]: raw file text | null }
 * @param patches   { [taskId]: patch text }
 * @param arch      arch.json or null
 * @param waivers   [{ rule_id, file, line, reason, waived_at }]
 */
export function buildVerdict({ plan, diff, outputs, patches, arch, waivers = [] }) {
  const linesByFile = Object.fromEntries(diff.files.map((f) => [f.path, f.changed_lines]));
  const failed = [];
  const dropped = [];
  const collected = [];

  for (const task of plan.tasks) {
    const parsed = parseTaskOutput(outputs[task.id], task);
    if (parsed.error) { failed.push({ id: task.id, reason: parsed.error }); continue; }
    const corpus = patchCorpus(patches[task.id] ?? '');
    for (const raw of parsed.findings) {
      const f = { ...raw, skill: task.skill, notes: [] };
      if (!evidenceInPatch(f.evidence, corpus)) {
        dropped.push({ task: task.id, file: f.file, line: f.line, title: f.title, reason: 'evidence not found in the diff' });
        continue;
      }
      if (!inChangedLines(f.line, linesByFile[f.file])) {
        if (f.severity !== 'SUGGESTION') f.notes.push(`pre-existing: was ${f.severity}`);
        f.severity = 'SUGGESTION';
      } else if (f.severity === 'CRITICAL' && !task.critical_rules.includes(f.rule_id)) {
        f.notes.push(task.can_block ? `clamped: ${f.rule_id} is not on the CRITICAL list` : 'clamped: this skill cannot block');
        f.severity = 'WARNING';
      }
      collected.push(f);
    }
  }

  if (plan.arch_check) {
    if (!arch?.ran) failed.push({ id: 'arch-check', reason: arch?.error ?? 'arch-check.mjs was not run' });
    else collected.push(...archFindings(arch, new Set(diff.files.map((f) => f.path))));
  }

  // Same rule on the same line from two batches or two skills: keep the strongest.
  const byKey = new Map();
  for (const f of collected) {
    const key = fingerprint(f);
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, { ...f, skills: [f.skill] }); continue; }
    if (!prev.skills.includes(f.skill)) prev.skills.push(f.skill);
    if (RANK[f.severity] < RANK[prev.severity]) Object.assign(prev, { ...f, skills: prev.skills });
  }

  const waived = new Map(waivers.map((w) => [fingerprint(w), w]));
  const findings = [...byKey.values()]
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0))
    .map((f, i) => {
      const w = f.severity === 'CRITICAL' ? waived.get(fingerprint(f)) : undefined;
      return { id: `F${i + 1}`, ...f, ...(w ? { waived: { reason: w.reason, waived_at: w.waived_at } } : {}) };
    });

  const counts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0, waived: 0 };
  for (const f of findings) {
    if (f.waived) counts.waived += 1;
    else counts[f.severity] += 1;
  }

  const reasons = [];
  if (failed.length) reasons.push('incomplete');
  if (counts.CRITICAL) reasons.push('critical');
  return {
    verdict: reasons.length ? 'blocked' : 'pass',
    reasons,
    counts,
    findings,
    failed_tasks: failed,
    dropped,
  };
}
