/**
 * Review-domain rules (`modules/reviews/domain.ts`) — the per-severity tally
 * written onto `agent_runs.findings_by_severity` when a run completes.
 */
import { describe, it, expect } from 'vitest';
import { rollupSeverities } from '../src/modules/reviews/domain.js';

describe('rollupSeverities', () => {
  it('tallies findings into CRITICAL / WARNING / SUGGESTION buckets (ignores unknown)', () => {
    expect(
      rollupSeverities([
        { severity: 'CRITICAL' },
        { severity: 'CRITICAL' },
        { severity: 'WARNING' },
        { severity: 'SUGGESTION' },
        { severity: 'WEIRD' },
      ]),
    ).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });

  it('is all-zero for no findings', () => {
    expect(rollupSeverities([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });
});
