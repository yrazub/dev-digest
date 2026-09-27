import type { RunSummary } from '@devdigest/shared';

/**
 * Pure review-domain rules (no DB / network / framework).
 */

/** Per-severity finding counts, persisted on `agent_runs.findings_by_severity`. */
export type SeverityCounts = NonNullable<RunSummary['findings_by_severity']>;

/** Tally finding severities (CRITICAL / WARNING / SUGGESTION) for one review. */
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.CRITICAL += 1;
    else if (r.severity === 'WARNING') c.WARNING += 1;
    else if (r.severity === 'SUGGESTION') c.SUGGESTION += 1;
  }
  return c;
}
