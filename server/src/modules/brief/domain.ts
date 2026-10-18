import { z } from 'zod';
import { RiskSeverity } from '@devdigest/shared';
import type {
  BlastDegradedReason,
  BlastTotals,
  BriefInput,
  BriefInputKind,
  BriefInputReason,
  Intent,
  Risk,
  ReviewFocusItem,
  Severity,
  SmartDiffRole,
} from '@devdigest/shared';
import { capWords } from '../_shared/text/plain-text.js';
import {
  DESCRIPTION_CUT_TOKENS,
  ISSUE_BODY_CUT_TOKENS,
  MAX_REVIEW_FINDINGS,
  MAX_REVIEW_FOCUS,
  MAX_RISKS,
  SUMMARY_MAX_CHARS,
} from './constants.js';

/**
 * Pure PR Brief rules (no DB / network / framework): hunk ranges, the linked issue, findings
 * selection, the trim sequence, input statuses, validation of the model's answer and the caps.
 * The service sequences the I/O around these. See `server/specs/L05-pr-brief.md`.
 */

// ---------------------------------------------------------------- model output

/** The model's own answer (module-local, not a contract); `PrBriefDraft` is its schema name. */
export const BriefModelOutput = z.object({
  summary: z.string().min(1).describe('One or two plain sentences: what the change does and why it matters.'),
  risks: z.array(
    z.object({
      kind: z.enum(['security', 'db_migration', 'breaking_api', 'perf', 'deps', 'config', 'other']),
      title: z.string().describe('A short label.'),
      explanation: z.string().describe('One sentence.'),
      severity: RiskSeverity,
      file_refs: z
        .array(z.string())
        .describe('Listed paths only, as `path`, `path:line` or `path:start-end`. At least one.'),
    }),
  ),
  review_focus: z.array(
    z.object({
      file: z.string().describe('A changed file, as listed.'),
      line: z.number().int().min(1).describe("A line inside that file's listed ranges."),
      reason: z.string().describe('Why a reviewer should look here.'),
    }),
  ),
});
export type BriefModelOutput = z.infer<typeof BriefModelOutput>;

// ---------------------------------------------------------------- hunk ranges

export interface LineRange {
  start: number;
  end: number;
}

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * The new-side line ranges of one file's patch, read from its `@@ -a,b +c,d @@` headers and
 * nothing else. A missing `d` is 1; a `d = 0` hunk (pure deletion) has no new-side line and is
 * left out. `null` for a file with no stored patch.
 */
export function parseNewSideRanges(patch: string | null): LineRange[] | null {
  if (patch === null || patch === undefined) return null;
  const ranges: LineRange[] = [];
  for (const line of patch.split('\n')) {
    if (!line.startsWith('@@')) continue;
    const m = HUNK_HEADER_RE.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count)) continue;
    if (start < 1 || count < 1) continue;
    ranges.push({ start, end: start + count - 1 });
  }
  return ranges;
}

/** `+<start>..<end>` for each range, space separated. */
export function formatRanges(ranges: readonly LineRange[]): string {
  return ranges.map((r) => `+${r.start}..${r.end}`).join(' ');
}

// ---------------------------------------------------------------- linked issue

const BARE_ISSUE_RE = /(?<![\w/&#])#(\d+)(?![\w-])/g;

/**
 * The first bare `#N` (N > 0) in text order of the sanitised description. `owner/repo#N`, a
 * URL, an HTML entity such as `&#39;` and `foo#12` do not count.
 */
export function findLinkedIssueNumber(sanitizedBody: string): number | null {
  for (const m of sanitizedBody.matchAll(BARE_ISSUE_RE)) {
    const n = Number(m[1]);
    if (Number.isSafeInteger(n) && n > 0) return n;
  }
  return null;
}

// ---------------------------------------------------------------- review findings

const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export interface ReviewFindingRow {
  file: string;
  line: number;
  severity: Severity;
  title: string;
  dismissed: boolean;
}

/**
 * The prompt lines for the latest completed review's findings: non-dismissed only, ordered
 * CRITICAL → WARNING → SUGGESTION (the stored order kept within a severity), at most
 * `MAX_REVIEW_FINDINGS`, each `file:line severity title`.
 */
export function selectReviewFindings(rows: readonly ReviewFindingRow[]): string[] {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.dismissed)
    .sort((a, b) => SEVERITY_ORDER[a.row.severity] - SEVERITY_ORDER[b.row.severity] || a.index - b.index)
    .slice(0, MAX_REVIEW_FINDINGS)
    .map(({ row }) => `${row.file}:${row.line} ${row.severity} ${row.title.replace(/\s+/g, ' ').trim()}`);
}

// ---------------------------------------------------------------- facts

export interface BriefFile {
  path: string;
  role: SmartDiffRole;
  additions: number;
  deletions: number;
  /** New-side ranges; `null` when no patch is stored. */
  ranges: LineRange[] | null;
}

export interface BriefDocument {
  path: string;
  text: string;
}

export interface BriefIssue {
  number: number;
  title: string;
  body: string;
}

/** Everything the model is shown, as plain data. Texts are already sanitised. */
export interface BriefFacts {
  title: string;
  intent: Intent | null;
  files: BriefFile[];
  /** Counted over every changed file, before any file is left out (R-SRV-18). */
  totals: { files: number; additions: number; deletions: number };
  blast: { summary: string; totals: BlastTotals; callers: string[] } | null;
  /** `file:line severity title` lines, already selected and ordered. */
  findings: string[];
  description: string | null;
  issue: BriefIssue | null;
  documents: BriefDocument[];
}

/** Why each input is what it is, before any trim: the facts that decide the statuses. */
export interface BriefOrigin {
  intent: { present: boolean; stale: boolean };
  blast: { hasSymbols: boolean; reason: BlastDegradedReason | null };
  descriptionEmpty: boolean;
  issueMiss: Extract<BriefInputReason, 'none_linked' | 'no_token' | 'not_found' | 'fetch_failed'> | null;
  documents: {
    /** Paths attached to the workspace's agents and skills. */
    attached: number;
    /** Documents read, before any was dropped for the budget. */
    read: number;
    notCloned: boolean;
    allSkipped: boolean;
  };
}

// ---------------------------------------------------------------- trimming

/** What `fitToBudget` cut; a count per kind of cut. */
export interface BriefTrims {
  documents: number;
  findings: number;
  issueBodyCut: boolean;
  issueDropped: boolean;
  descriptionCut: boolean;
  callers: number;
  files: number;
}

/**
 * The longest prefix of `text` with `count(prefix) <= max`, trailing whitespace removed.
 * `count` is assumed monotone in the prefix length.
 */
export function cutToTokens(text: string, max: number, count: (t: string) => number): string {
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (count(text.slice(0, mid)) <= max) lo = mid;
    else hi = mid - 1;
  }
  // Never end on half of a surrogate pair.
  const last = text.charCodeAt(lo - 1);
  if (lo > 0 && last >= 0xd800 && last <= 0xdbff) lo -= 1;
  return text.slice(0, lo).trimEnd();
}

/**
 * Apply the R-SRV-17 cuts in order, re-measuring after each, until `measure(facts) <= budget`:
 * documents whole from the last; findings from the end; the issue body to
 * `ISSUE_BODY_CUT_TOKENS`, then the issue; the description to `DESCRIPTION_CUT_TOKENS`; blast
 * callers one at a time from the end; changed files one at a time from the end. The title, the
 * intent and the totals are never touched (R-SRV-18). A cut that would change nothing is skipped.
 */
export function fitToBudget(
  facts: BriefFacts,
  measure: (f: BriefFacts) => number,
  budget: number,
  count: (t: string) => number,
): { facts: BriefFacts; tokens: number; trims: BriefTrims } {
  const trims: BriefTrims = {
    documents: 0,
    findings: 0,
    issueBodyCut: false,
    issueDropped: false,
    descriptionCut: false,
    callers: 0,
    files: 0,
  };
  let current = facts;
  let tokens = measure(current);

  /** Runs one cut; `next` returns the cut facts, or `null` when there is nothing left to cut. */
  const run = (next: (f: BriefFacts) => BriefFacts | null, once: boolean, record: () => void): void => {
    while (tokens > budget) {
      const cut = next(current);
      if (cut === null) return;
      current = cut;
      record();
      tokens = measure(current);
      if (once) return;
    }
  };

  run(
    (f) => (f.documents.length > 0 ? { ...f, documents: f.documents.slice(0, -1) } : null),
    false,
    () => (trims.documents += 1),
  );
  run(
    (f) => (f.findings.length > 0 ? { ...f, findings: f.findings.slice(0, -1) } : null),
    false,
    () => (trims.findings += 1),
  );
  run(
    (f) => {
      if (f.issue === null || count(f.issue.body) <= ISSUE_BODY_CUT_TOKENS) return null;
      return { ...f, issue: { ...f.issue, body: cutToTokens(f.issue.body, ISSUE_BODY_CUT_TOKENS, count) } };
    },
    true,
    () => (trims.issueBodyCut = true),
  );
  run(
    (f) => (f.issue !== null ? { ...f, issue: null } : null),
    true,
    () => (trims.issueDropped = true),
  );
  run(
    (f) => {
      if (f.description === null || count(f.description) <= DESCRIPTION_CUT_TOKENS) return null;
      return { ...f, description: cutToTokens(f.description, DESCRIPTION_CUT_TOKENS, count) };
    },
    true,
    () => (trims.descriptionCut = true),
  );
  run(
    (f) =>
      f.blast !== null && f.blast.callers.length > 0
        ? { ...f, blast: { ...f.blast, callers: f.blast.callers.slice(0, -1) } }
        : null,
    false,
    () => (trims.callers += 1),
  );
  run(
    (f) => (f.files.length > 0 ? { ...f, files: f.files.slice(0, -1) } : null),
    false,
    () => (trims.files += 1),
  );

  return { facts: current, tokens, trims };
}

// ---------------------------------------------------------------- input statuses

const INPUT_KINDS: readonly BriefInputKind[] = [
  'intent',
  'blast_radius',
  'diff_stats',
  'description',
  'linked_issue',
  'spec_documents',
];

function input(
  kind: BriefInputKind,
  status: BriefInput['status'],
  reason: BriefInputReason | null = null,
  omitted: number | null = null,
): BriefInput {
  return { kind, status, reason, omitted };
}

function recordInput(kind: BriefInputKind, origin: BriefOrigin, trims: BriefTrims): BriefInput {
  switch (kind) {
    case 'intent':
      if (!origin.intent.present) return input(kind, 'missing', 'not_derived');
      return input(kind, 'used', origin.intent.stale ? 'stale' : null);
    case 'blast_radius':
      if (!origin.blast.hasSymbols) return input(kind, 'missing', origin.blast.reason ?? 'no_data');
      // A trim wins over a degraded-but-used reason.
      if (trims.callers > 0) return input(kind, 'trimmed', 'over_budget', trims.callers);
      return input(kind, 'used', origin.blast.reason);
    case 'diff_stats':
      if (trims.files > 0) return input(kind, 'trimmed', 'over_budget', trims.files);
      return input(kind, 'used');
    case 'description':
      if (origin.descriptionEmpty) return input(kind, 'missing', 'empty');
      if (trims.descriptionCut) return input(kind, 'trimmed', 'over_budget');
      return input(kind, 'used');
    case 'linked_issue':
      if (origin.issueMiss !== null) return input(kind, 'missing', origin.issueMiss);
      if (trims.issueDropped) return input(kind, 'missing', 'over_budget');
      if (trims.issueBodyCut) return input(kind, 'trimmed', 'over_budget');
      return input(kind, 'used');
    case 'spec_documents': {
      const docs = origin.documents;
      // Nothing attached wins over a missing clone.
      if (docs.attached === 0) return input(kind, 'missing', 'none_attached');
      if (docs.notCloned) return input(kind, 'missing', 'not_cloned');
      if (docs.allSkipped || docs.read === 0) return input(kind, 'missing', 'all_skipped');
      if (trims.documents >= docs.read) return input(kind, 'missing', 'over_budget', docs.read);
      if (trims.documents > 0) return input(kind, 'trimmed', 'over_budget', trims.documents);
      return input(kind, 'used');
    }
  }
}

/** One `BriefInput` per `BriefInputKind`, in enum order, following the server spec's status table. */
export function recordInputs(origin: BriefOrigin, trims: BriefTrims): BriefInput[] {
  return INPUT_KINDS.map((kind) => recordInput(kind, origin, trims));
}

// ---------------------------------------------------------------- validation

/** One leading `./` removed. */
export function stripDotSlash(path: string): string {
  return path.startsWith('./') ? path.slice(2) : path;
}

const LINE_SUFFIX_RE = /:\d+(?:-\d+)?$/;

/** The path part of a risk reference: one leading `./` removed, then an optional `:<n>` or `:<a>-<b>`. */
export function refPath(ref: string): string {
  return stripDotSlash(ref).replace(LINE_SUFFIX_RE, '');
}

export interface ValidationContext {
  /** Changed-file path → its new-side ranges (`null` when no patch is stored). */
  changedFiles: Map<string, LineRange[] | null>;
  /** `file` of the blast map's changed symbols and callers. */
  blastFiles: Set<string>;
}

function nearestRangeStart(line: number, ranges: readonly LineRange[]): number {
  let best = ranges[0] as LineRange;
  let bestDistance = Infinity;
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    if (line >= range.start && line <= range.end) return line;
    const distance = line < range.start ? range.start - line : line - range.end;
    // Strictly smaller: a tie stays with the earlier range.
    if (distance < bestDistance) {
      bestDistance = distance;
      best = range;
    }
  }
  return best.start;
}

/**
 * Keep only what the pull request backs (R-SRV-6 to R-SRV-10). A risk keeps the references whose
 * path is a changed file or a file of the blast map, and is dropped when none is left; a focus
 * item keeps only a changed file and has its line moved to the first line of the nearest new-side
 * range when it lies outside every range (only for a file with ranges).
 */
export function validateDraft(
  draft: BriefModelOutput,
  ctx: ValidationContext,
): { risks: Risk[]; review_focus: ReviewFocusItem[]; dropped: { risks: number; review_focus: number } } {
  const risks: Risk[] = [];
  let droppedRisks = 0;
  for (const risk of draft.risks) {
    const refs = risk.file_refs
      .filter((ref) => {
        const path = refPath(ref);
        return ctx.changedFiles.has(path) || ctx.blastFiles.has(path);
      })
      .map(stripDotSlash);
    if (refs.length === 0) {
      droppedRisks += 1;
      continue;
    }
    risks.push({ ...risk, file_refs: refs });
  }

  const reviewFocus: ReviewFocusItem[] = [];
  let droppedFocus = 0;
  for (const item of draft.review_focus) {
    const file = stripDotSlash(item.file);
    if (!ctx.changedFiles.has(file)) {
      droppedFocus += 1;
      continue;
    }
    const ranges = ctx.changedFiles.get(file) ?? null;
    const line = ranges !== null && ranges.length > 0 ? nearestRangeStart(item.line, ranges) : item.line;
    reviewFocus.push({ file, line, reason: item.reason });
  }

  return { risks, review_focus: reviewFocus, dropped: { risks: droppedRisks, review_focus: droppedFocus } };
}

/** R-SRV-11: the first 6 risks, the first 6 focus items, the summary cut at a word boundary. */
export function capBrief(
  summary: string,
  risks: Risk[],
  reviewFocus: ReviewFocusItem[],
): { summary: string; risks: Risk[]; review_focus: ReviewFocusItem[] } {
  return {
    summary: capWords(summary, SUMMARY_MAX_CHARS),
    risks: risks.slice(0, MAX_RISKS),
    review_focus: reviewFocus.slice(0, MAX_REVIEW_FOCUS),
  };
}
