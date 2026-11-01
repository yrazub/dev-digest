import type {
  EvalCaseOutcome,
  EvalExpectation,
  EvalExpectationKind,
  EvalFoundFinding,
  Finding,
} from '@devdigest/shared';

/**
 * Pure eval rules: the diff fragment cut, case naming, the match rule, the per-case
 * score and the run aggregate. Imports only `@devdigest/shared` types — the scorer is
 * a function of expectations and findings alone (R-SRV-24, scanned by a test).
 */

/** Above this many hunk lines a stored file section keeps only the hunks that touch the finding. */
export const FRAGMENT_CUT_LINES = 1500;
/** Longest slug in a case name. */
export const CASE_SLUG_MAX = 34;
/**
 * Lines a finding may sit off a `must_find` expectation and still match (both sides). Lives here, not in
 * `constants.ts`: the scorer imports only `@devdigest/shared` (R-SRV-24), like the two constants above.
 */
export const MUST_FIND_LINE_TOLERANCE = 2;

/** `@@ -a,b +c,d @@` — captures the new-side start and (optional) length. */
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * Rebuild a unified diff from stored `pr_files` patches, the way review runs do.
 * Files with no patch are skipped.
 */
export function rawDiffFromPatches(files: { path: string; patch: string | null }[]): string {
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parts.join('\n');
}

interface Hunk {
  lines: string[];
  /** New-side range `[start, end]`; `end < start` for a hunk that adds no new-side line. */
  start: number;
  end: number;
}

/** The hunks of the first `diff --git a/<file> b/<file>` section of `raw`, in order. */
function hunksOfFile(raw: string, file: string): Hunk[] | null {
  const lines = raw.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();

  const header = `diff --git a/${file} b/${file}`;
  const from = lines.indexOf(header);
  if (from === -1) return null;

  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  for (let i = from + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.startsWith('diff --git ')) break;
    const m = HUNK_HEADER.exec(line);
    if (m) {
      const start = Number(m[1]);
      const len = m[2] === undefined ? 1 : Number(m[2]);
      current = { lines: [line], start, end: start + len - 1 };
      hunks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  return hunks;
}

/**
 * The finding's file section of `raw`, normalised to three header lines and the hunks.
 * Above `FRAGMENT_CUT_LINES` hunk lines only the hunks overlapping the finding's range are kept.
 * `null` when there is no section, no hunk, or the cut leaves no hunk (R-SRV-3, R-SRV-4, R-SRV-8).
 */
export function cutFileSection(
  raw: string,
  file: string,
  range: { start_line: number; end_line: number },
): string | null {
  const hunks = hunksOfFile(raw, file);
  if (!hunks || hunks.length === 0) return null;

  const total = hunks.reduce((n, h) => n + h.lines.length, 0);
  const kept =
    total > FRAGMENT_CUT_LINES
      ? hunks.filter((h) => h.start <= range.end_line && range.start_line <= h.end)
      : hunks;
  if (kept.length === 0) return null;

  return [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, ...kept.flatMap((h) => h.lines)].join(
    '\n',
  );
}

/** `must-find-<slug>` / `no-<slug>` (R-SRV-12). */
export function caseName(kind: EvalExpectationKind, title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, CASE_SLUG_MAX)
      .replace(/-+$/, '') || 'finding';
  return `${kind === 'must_find' ? 'must-find' : 'no'}-${slug}`;
}

/**
 * A grounded finding matches an expectation when it is in the same file and the line ranges overlap
 * (R-SRV-19). A `must_find` expectation widens its range by `MUST_FIND_LINE_TOLERANCE` on both sides —
 * models miscount lines in a diff that carries no line numbers; `must_not_flag` stays an exact overlap.
 */
export function findingMatches(
  f: { file: string; start_line: number; end_line: number },
  e: EvalExpectation,
): boolean {
  const slack = e.kind === 'must_find' ? MUST_FIND_LINE_TOLERANCE : 0;
  return f.file === e.file && f.start_line <= e.end_line + slack && e.start_line - slack <= f.end_line;
}

function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

/**
 * Score one case from the engine's kept (grounded) findings and its dropped count.
 * - `pass`: `must_find` — at least one matching finding; `must_not_flag` — none.
 * - `recall`: 1 or 0 for `must_find`, null for `must_not_flag`.
 * - `precision`: the case's TP / (TP + FP) — matching findings are TP on a `must_find` case and FP
 *   on a `must_not_flag` case; null when there are none. An unmatched finding counts in neither.
 * - `citation_accuracy`: kept / (kept + dropped), null when both are 0.
 */
export function scoreCase(
  e: EvalExpectation,
  kept: Pick<Finding, 'file' | 'start_line' | 'end_line' | 'title' | 'severity' | 'category'>[],
  dropped: number,
): {
  pass: boolean;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  actual_output: { findings: EvalFoundFinding[]; dropped: number };
} {
  const findings: EvalFoundFinding[] = kept.map((f) => ({
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    title: f.title,
    severity: f.severity,
    category: f.category,
    matches: findingMatches(f, e),
  }));
  const matching = findings.filter((f) => f.matches).length;
  const mustFind = e.kind === 'must_find';
  const pass = mustFind ? matching > 0 : matching === 0;

  return {
    pass,
    recall: mustFind ? (pass ? 1 : 0) : null,
    precision: ratio(mustFind ? matching : 0, matching),
    citation_accuracy: ratio(kept.length, kept.length + dropped),
    actual_output: { findings, dropped },
  };
}

/**
 * Aggregate the stored case rows of a run over the non-errored rows (R-SRV-18, R-SRV-20–R-SRV-23).
 * `cost_usd` is the sum over the non-errored rows, null when any of them is null or there are none.
 */
export function aggregateRun(
  rows: {
    kind: EvalExpectationKind;
    error: string | null;
    pass: boolean | null;
    actual_output: { findings: { matches: boolean }[]; dropped: number } | null;
    cost_usd: number | null;
  }[],
): {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  cases_passed: number;
  cases_errored: number;
  cost_usd: number | null;
} {
  const done = rows.filter((r) => r.error === null);
  const matchCount = (r: (typeof rows)[number]) => r.actual_output?.findings.filter((f) => f.matches).length ?? 0;

  const mustFind = done.filter((r) => r.kind === 'must_find');
  const mustNot = done.filter((r) => r.kind === 'must_not_flag');
  const tp = mustFind.reduce((n, r) => n + matchCount(r), 0);
  const fp = mustNot.reduce((n, r) => n + matchCount(r), 0);

  let kept = 0;
  let dropped = 0;
  for (const r of done) {
    kept += r.actual_output?.findings.length ?? 0;
    dropped += r.actual_output?.dropped ?? 0;
  }

  const costs = done.map((r) => r.cost_usd);
  const cost = done.length === 0 || costs.some((c) => c === null) ? null : costs.reduce<number>((s, c) => s + (c ?? 0), 0);

  return {
    recall: ratio(mustFind.filter((r) => matchCount(r) > 0).length, mustFind.length),
    precision: ratio(tp, tp + fp),
    citation_accuracy: ratio(kept, kept + dropped),
    cases_passed: done.filter((r) => r.pass === true).length,
    cases_errored: rows.length - done.length,
    cost_usd: cost,
  };
}

/** `errored` when the case threw, else `pass` / `fail`. */
export function outcomeOf(row: { error: string | null; pass: boolean | null }): EvalCaseOutcome {
  if (row.error !== null) return 'errored';
  return row.pass ? 'pass' : 'fail';
}
