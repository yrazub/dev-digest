import type { SeverityCounts } from '@devdigest/shared';

// 100 = clean; each finding costs points by severity. Pure rule: no I/O.
export function scoreFrom(counts: SeverityCounts): number {
  const penalty = counts.CRITICAL * 25 + counts.WARNING * 8 + counts.SUGGESTION * 2;
  return Math.max(0, 100 - penalty);
}
