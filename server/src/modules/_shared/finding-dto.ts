import type { Finding, FindingRecord } from '@devdigest/shared';

/**
 * Persisted finding row → the `FindingRecord` wire contract. Shared by `reviews` (review payloads, finding
 * actions) and `pulls` (the PR-list findings preview), so it lives here rather
 * than in either module.
 *
 * The input is structural — a persisted finding's columns — so this file does
 * not import `src/db`; a Drizzle `FindingRow` satisfies it as-is.
 */
export interface PersistedFinding {
  id: string;
  reviewId: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  rationale: string;
  suggestion: string | null;
  confidence: number;
  kind: string;
  trifectaComponents: string[] | null;
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}

export function findingRowToDto(row: PersistedFinding): FindingRecord {
  return {
    id: row.id,
    severity: row.severity as Finding['severity'],
    category: row.category as Finding['category'],
    title: row.title,
    file: row.file,
    start_line: row.startLine,
    end_line: row.endLine,
    rationale: row.rationale,
    suggestion: row.suggestion ?? null,
    confidence: row.confidence,
    kind: (row.kind as Finding['kind']) ?? 'finding',
    trifecta_components: (row.trifectaComponents as Finding['trifecta_components']) ?? null,
    evidence: null,
    review_id: row.reviewId,
    accepted_at: row.acceptedAt?.toISOString() ?? null,
    dismissed_at: row.dismissedAt?.toISOString() ?? null,
  };
}
