import type { Finding } from '@devdigest/shared';
import { FULL_FILE_KINDS } from './grounding.js';

/**
 * Scope filter — deterministic, applied after grounding when the caller asks.
 *
 * The reviewer model only TAGS a finding (`scope`); this module decides what is
 * filtered, from `severity`, `category` and `kind` alone, so no text in the PR
 * can reach the decision. Rules:
 *  - `in_scope` or untagged → kept;
 *  - a full-file scanner kind → kept, whatever its tag;
 *  - `out_of_scope` and SERIOUS (CRITICAL, or a security WARNING) → kept as the
 *    one signal for that problem (overlapping serious findings in one file collapse
 *    to the most severe, then most confident);
 *  - any other `out_of_scope` → filtered, with a reason.
 */

export interface ScopeFilterResult {
  /** Findings that stay, in input order (signals included). */
  kept: Finding[];
  /** Findings removed, with the reason (for logs and the trace). */
  filtered: { finding: Finding; reason: string }[];
  /** The serious out-of-scope findings that were kept, one per distinct problem. */
  signals: Finding[];
}

const SEVERITY_RANK: Record<Finding['severity'], number> = {
  CRITICAL: 2,
  WARNING: 1,
  SUGGESTION: 0,
};

/** Out-of-scope but too serious to hide: any CRITICAL, or a security WARNING. */
export function isSeriousOutOfScope(finding: Finding): boolean {
  if (finding.scope !== 'out_of_scope') return false;
  if (finding.kind && FULL_FILE_KINDS.has(finding.kind)) return false;
  return (
    finding.severity === 'CRITICAL' ||
    (finding.category === 'security' && finding.severity === 'WARNING')
  );
}

function overlaps(a: Finding, b: Finding): boolean {
  if (a.file !== b.file) return false;
  const aLo = Math.min(a.start_line, a.end_line);
  const aHi = Math.max(a.start_line, a.end_line);
  const bLo = Math.min(b.start_line, b.end_line);
  const bHi = Math.max(b.start_line, b.end_line);
  return aLo <= bHi && bLo <= aHi;
}

/** `a` is a better signal than `b`: more severe, then more confident, then earlier. */
function beats(a: { f: Finding; i: number }, b: { f: Finding; i: number }): boolean {
  const bySeverity = SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity];
  if (bySeverity !== 0) return bySeverity > 0;
  if (a.f.confidence !== b.f.confidence) return a.f.confidence > b.f.confidence;
  return a.i < b.i;
}

export function applyScopeFilter(findings: Finding[]): ScopeFilterResult {
  const serious = findings
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => isSeriousOutOfScope(f));

  // Group serious findings of one file whose line ranges overlap (transitively).
  const parent = serious.map((_, k) => k);
  const find = (k: number): number => {
    while (parent[k] !== k) {
      parent[k] = parent[parent[k]!]!;
      k = parent[k]!;
    }
    return k;
  };
  for (let a = 0; a < serious.length; a++) {
    for (let b = a + 1; b < serious.length; b++) {
      if (overlaps(serious[a]!.f, serious[b]!.f)) parent[find(b)] = find(a);
    }
  }
  const winners = new Map<number, { f: Finding; i: number }>();
  serious.forEach((entry, k) => {
    const root = find(k);
    const best = winners.get(root);
    if (!best || beats(entry, best)) winners.set(root, entry);
  });
  const signalIndexes = new Set([...winners.values()].map((w) => w.i));

  const kept: Finding[] = [];
  const filtered: { finding: Finding; reason: string }[] = [];
  const signals: Finding[] = [];

  findings.forEach((finding, i) => {
    if (finding.scope !== 'out_of_scope') {
      kept.push(finding);
    } else if (finding.kind && FULL_FILE_KINDS.has(finding.kind)) {
      kept.push(finding);
    } else if (isSeriousOutOfScope(finding)) {
      if (signalIndexes.has(i)) {
        kept.push(finding);
        signals.push(finding);
      } else {
        filtered.push({ finding, reason: 'duplicate of out-of-scope signal' });
      }
    } else {
      filtered.push({ finding, reason: `out of scope (${finding.severity})` });
    }
  });

  return { kept, filtered, signals };
}
