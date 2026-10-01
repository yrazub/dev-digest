import type { ConventionCandidate, ConventionCategory, ConventionStatus } from '@devdigest/shared';

/**
 * L02 — conventions domain rules: pure, no I/O.
 */

/** A candidate whose evidence was found in the real file (`verify.ts`), ready to store. */
export interface VerifiedCandidate {
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  evidenceSnippet: string;
  confidence: number;
}

/** A stored candidate, before the repo-specific `evidence_url` is attached. */
export interface ConventionRecord {
  id: string;
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceLineStart: number;
  evidenceLineEnd: number;
  evidenceSnippet: string;
  confidence: number;
  status: ConventionStatus;
}

/** The repo coordinates an evidence link is built from. */
export interface EvidenceRepo {
  owner: string;
  name: string;
  /** Commit the index was built from; links are pinned to it. */
  sha: string | null;
}

/** Rule identity for dedup and "never re-propose a rejected rule": case, spacing, trailing punctuation. */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!;:,\s]+$/, '');
}

/** Identity of a candidate's evidence location; prefixed so it never collides with a rule key. */
export function evidenceKey(path: string, lineStart: number): string {
  return `@evidence:${path}:${lineStart}`;
}

/** GitHub blob link to the cited range, pinned to the indexed commit. */
export function evidenceUrl(repo: EvidenceRepo, path: string, start: number, end: number): string | null {
  if (!repo.sha) return null;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const anchor = start === end ? `#L${start}` : `#L${start}-L${end}`;
  return `https://github.com/${repo.owner}/${repo.name}/blob/${repo.sha}/${encoded}${anchor}`;
}

export function toCandidate(record: ConventionRecord, repo: EvidenceRepo): ConventionCandidate {
  return {
    id: record.id,
    category: record.category,
    rule: record.rule,
    evidence_path: record.evidencePath,
    evidence_line_start: record.evidenceLineStart,
    evidence_line_end: record.evidenceLineEnd,
    evidence_snippet: record.evidenceSnippet,
    evidence_url: evidenceUrl(repo, record.evidencePath, record.evidenceLineStart, record.evidenceLineEnd),
    confidence: record.confidence,
    status: record.status,
  };
}
