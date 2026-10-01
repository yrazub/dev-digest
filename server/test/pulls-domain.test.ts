/**
 * PR-list rules (`modules/pulls/domain.ts`) — the pure derivations behind each
 * PR's review STATUS, latest SCORE, total COST and latest-run FINDINGS. The DB
 * `status` column holds GitHub's merge state; the review status
 * (needs_review / reviewed / stale) is derived from head vs lastReviewedSha
 * + age, so all of it gets unit coverage independent of the queries.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveReviewStatus,
  latestScoreByPr,
  pickNeedingDiffStats,
  summarizeCompletedRuns,
  STALE_DAYS,
} from '../src/modules/pulls/domain.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 11);

describe('deriveReviewStatus', () => {
  it('needs_review when never reviewed, or when head moved since the last review', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: null, headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'old', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
  });

  it('reviewed when the current head was reviewed and the PR is recent', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now - DAY), now }),
    ).toBe('reviewed');
  });

  it('stale when the current head was reviewed but the PR is older than STALE_DAYS', () => {
    expect(
      deriveReviewStatus({
        ghStatus: 'open',
        lastReviewedSha: 'abc',
        headSha: 'abc',
        updatedAt: new Date(now - (STALE_DAYS + 1) * DAY),
        now,
      }),
    ).toBe('stale');
  });

  it('keeps merged/closed regardless of review state', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'merged', lastReviewedSha: null, headSha: 'abc', updatedAt: null, now }),
    ).toBe('merged');
    expect(
      deriveReviewStatus({ ghStatus: 'closed', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('closed');
  });
});

describe('latestScoreByPr', () => {
  it('keeps the first (newest) score seen per PR, including a null score', () => {
    const scores = latestScoreByPr([
      { prId: 'a', score: null },
      { prId: 'b', score: 80 },
      { prId: 'a', score: 90 },
    ]);
    expect(scores.get('a')).toBeNull();
    expect(scores.get('b')).toBe(80);
    expect(scores.has('c')).toBe(false);
  });
});

describe('summarizeCompletedRuns', () => {
  const sev = { CRITICAL: 1, WARNING: 0, SUGGESTION: 2 };

  it('sums cost across completed runs and takes findings from the newest run', () => {
    const { latestRunByPr, totalCostByPr } = summarizeCompletedRuns([
      { prId: 'a', runId: 'r2', costUsd: 0.5, findingsBySeverity: sev },
      { prId: 'a', runId: 'r1', costUsd: 0.25, findingsBySeverity: null },
    ]);
    expect(totalCostByPr.get('a')).toBe(0.75);
    expect(latestRunByPr.get('a')).toEqual({ runId: 'r2', findingsBySeverity: sev });
  });

  it('makes the total unknown (null) once any run is unpriced, whatever its position', () => {
    const { totalCostByPr } = summarizeCompletedRuns([
      { prId: 'a', runId: 'r3', costUsd: 0.5, findingsBySeverity: null },
      { prId: 'a', runId: 'r2', costUsd: null, findingsBySeverity: null },
      { prId: 'a', runId: 'r1', costUsd: 0.25, findingsBySeverity: null },
    ]);
    expect(totalCostByPr.get('a')).toBeNull();
  });

  it('skips runs without a PR and leaves PRs without runs absent', () => {
    const { latestRunByPr, totalCostByPr } = summarizeCompletedRuns([
      { prId: null, runId: 'r1', costUsd: 1, findingsBySeverity: null },
    ]);
    expect(latestRunByPr.size).toBe(0);
    expect(totalCostByPr.size).toBe(0);
  });
});

describe('pickNeedingDiffStats', () => {
  it('picks only PRs with all-zero diff stats, capped at the limit', () => {
    const zero = { additions: 0, deletions: 0, filesCount: 0 };
    const rows = [
      { id: 'a', ...zero },
      { id: 'b', additions: 3, deletions: 0, filesCount: 1 },
      { id: 'c', ...zero },
      { id: 'd', ...zero },
    ];
    expect(pickNeedingDiffStats(rows, 2).map((r) => r.id)).toEqual(['a', 'c']);
  });
});
