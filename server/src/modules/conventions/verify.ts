import { CONVENTION_RULE_MAX } from '@devdigest/shared';
import { normalizeRule, type VerifiedCandidate } from './domain.js';
import type { ConventionLlmCandidate } from './llm-schema.js';
import type { SampledFile } from './sample.js';

/**
 * L02 — conventions step 3: check every candidate's evidence against the real
 * file, with no model involved. A candidate survives only when its snippet is
 * found in a sampled code file; its line range is then set to where the
 * snippet actually is, and the stored snippet is the file's own text.
 */

/** How far from the cited line a match still counts as "near" before searching the whole file. */
const NEAR_LINES = 5;
/** A first line shorter than this must match the whole trimmed line, not a substring. */
const MIN_PARTIAL = 12;
/** Longest evidence range kept. */
const MAX_RANGE_LINES = 15;

export interface VerifyResult {
  verified: VerifiedCandidate[];
  dropped: number;
}

/** Snippet lines to look for: trimmed, non-blank, and without a copied "12| " number prefix. */
function snippetLines(snippet: string): string[] {
  return snippet
    .split('\n')
    .map((l) => l.replace(/^\s*\d+\|\s?/, '').trim())
    .filter((l) => l.length > 0);
}

function lineMatches(fileLine: string, wanted: string): boolean {
  const have = fileLine.trim();
  if (have === wanted) return true;
  return wanted.length >= MIN_PARTIAL && have.includes(wanted);
}

/**
 * If the snippet starts at file line index `i`, the 0-based index of its last
 * line; otherwise -1. Blank file lines between snippet lines are skipped.
 */
function matchAt(lines: string[], i: number, wanted: string[]): number {
  if (!lineMatches(lines[i]!, wanted[0]!)) return -1;
  let at = i;
  for (const next of wanted.slice(1)) {
    at++;
    while (at < lines.length && lines[at]!.trim() === '') at++;
    if (at >= lines.length || !lineMatches(lines[at]!, next)) return -1;
  }
  return at;
}

/** Start indexes to try: nearest to the cited line first, then the rest of the file in order. */
function searchOrder(length: number, cited: number): number[] {
  const near: number[] = [];
  for (let d = 0; d <= NEAR_LINES; d++) {
    for (const i of d === 0 ? [cited] : [cited - d, cited + d]) {
      if (i >= 0 && i < length) near.push(i);
    }
  }
  const seen = new Set(near);
  const rest = Array.from({ length }, (_, i) => i).filter((i) => !seen.has(i));
  return [...near, ...rest];
}

function locate(content: string, citedLine: number, snippet: string): { start: number; end: number } | null {
  const wanted = snippetLines(snippet);
  if (wanted.length === 0) return null;
  const lines = content.split('\n');
  for (const i of searchOrder(lines.length, citedLine - 1)) {
    const end = matchAt(lines, i, wanted);
    if (end >= 0) return { start: i + 1, end: end + 1 };
  }
  return null;
}

function normalizePath(path: string): string {
  return path.trim().replace(/^\.?\//, '');
}

export function verifyCandidates(candidates: ConventionLlmCandidate[], files: SampledFile[]): VerifyResult {
  const code = new Map(files.filter((f) => f.kind === 'code').map((f) => [f.path, f.content]));
  const seenRules = new Set<string>();
  const verified: VerifiedCandidate[] = [];

  for (const c of candidates) {
    const rule = c.rule.trim();
    const key = normalizeRule(rule);
    if (!key || rule.length > CONVENTION_RULE_MAX || seenRules.has(key)) continue;
    const path = normalizePath(c.evidence.path);
    const content = code.get(path);
    if (content === undefined) continue;
    const range = locate(content, c.evidence.line, c.evidence.snippet);
    if (!range) continue;
    const end = Math.min(range.end, range.start + MAX_RANGE_LINES - 1);
    seenRules.add(key);
    verified.push({
      category: c.category,
      rule,
      evidencePath: path,
      evidenceLineStart: range.start,
      evidenceLineEnd: end,
      evidenceSnippet: content.split('\n').slice(range.start - 1, end).join('\n'),
      confidence: Math.min(1, Math.max(0, c.confidence)),
    });
  }
  return { verified, dropped: candidates.length - verified.length };
}
