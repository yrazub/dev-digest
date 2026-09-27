import type { PrDetail, PrMeta, PrStatus } from '@devdigest/shared';

/**
 * Pure pulls-domain rules (no DB / network / framework), so they unit-test
 * cleanly.
 *
 * The Pull Requests list shows, per PR: the latest review's SCORE, the total
 * COST of its completed runs, a FINDINGS severity breakdown, and a review
 * STATUS. The DB `status` column holds GitHub's merge state (open/merged/
 * closed); the review status (needs_review / reviewed / stale) is DERIVED here
 * for OPEN PRs from the commit a review last ran against (`lastReviewedSha`)
 * vs the PR head, plus age.
 */

/** Open PRs whose current head was reviewed but untouched this long read "stale". */
export const STALE_DAYS = 7;

/** Diff-stat backfills per list request (each one is a GitHub detail fetch). */
export const BACKFILL_LIMIT = 10;

export type SeverityCounts = NonNullable<PrMeta['findings_by_severity']>;

/** A persisted pull request, as the service and these rules see it. */
export interface PullRecord {
  id: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  additions: number;
  deletions: number;
  filesCount: number;
  /** GitHub merge state (open/merged/closed). */
  status: string;
  lastReviewedSha: string | null;
  body: string | null;
  openedAt: Date | null;
  updatedAt: Date | null;
}

/** The repo a PR belongs to — enough to address it on GitHub. */
export interface RepoRecord {
  id: string;
  owner: string;
  name: string;
}

export interface ReviewScoreRow {
  prId: string;
  score: number | null;
}

export interface CompletedRunRow {
  prId: string | null;
  runId: string;
  costUsd: number | null;
  findingsBySeverity: SeverityCounts | null;
}

export interface LatestRun {
  runId: string;
  findingsBySeverity: SeverityCounts | null;
}

/**
 * Review-freshness status for the PR list. Merged/closed PRs keep their GitHub
 * merge state; open PRs map to:
 *  - `needs_review` — never reviewed, OR head moved since the last review
 *  - `stale`        — current head was reviewed but the PR is older than STALE_DAYS
 *  - `reviewed`     — current head reviewed and recent
 */
export function deriveReviewStatus(args: {
  /** DB `status` column = GitHub merge state (open/merged/closed). */
  ghStatus: string;
  lastReviewedSha: string | null;
  headSha: string;
  updatedAt: Date | null;
  now: number;
  staleDays?: number;
}): PrStatus {
  const { ghStatus, lastReviewedSha, headSha, updatedAt, now } = args;
  if (ghStatus === 'merged' || ghStatus === 'closed') return ghStatus as PrStatus;
  if (!lastReviewedSha || lastReviewedSha !== headSha) return 'needs_review';
  const staleMs = (args.staleDays ?? STALE_DAYS) * 86_400_000;
  if (updatedAt && now - updatedAt.getTime() > staleMs) return 'stale';
  return 'reviewed';
}

/**
 * PRs imported from GitHub's list payload land with zeroed diff stats. Pick
 * the ones still waiting for a backfill, capped per request.
 */
export function pickNeedingDiffStats<T extends Pick<PullRecord, 'additions' | 'deletions' | 'filesCount'>>(
  rows: T[],
  limit = BACKFILL_LIMIT,
): T[] {
  return rows
    .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
    .slice(0, limit);
}

/** Latest review score per PR. Input is newest-first, so the first row seen wins. */
export function latestScoreByPr(rows: ReviewScoreRow[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const rv of rows) {
    if (!out.has(rv.prId)) out.set(rv.prId, rv.score);
  }
  return out;
}

/**
 * One pass over each PR's COMPLETED runs (newest-first) feeds two columns:
 *  - COST: the TOTAL spent on the PR — the sum over every completed run. An
 *    unpriced run (costUsd null) makes the total unknown (null), never a
 *    partial sum that reads as complete — same sticky-null rule the engine
 *    applies across chunks.
 *  - FINDINGS: the latest completed run only (the popover says "in this run").
 */
export function summarizeCompletedRuns(rows: CompletedRunRow[]): {
  latestRunByPr: Map<string, LatestRun>;
  totalCostByPr: Map<string, number | null>;
} {
  const latestRunByPr = new Map<string, LatestRun>();
  const totalCostByPr = new Map<string, number | null>();
  for (const run of rows) {
    if (!run.prId) continue;
    if (!latestRunByPr.has(run.prId)) {
      latestRunByPr.set(run.prId, {
        runId: run.runId,
        findingsBySeverity: run.findingsBySeverity ?? null,
      });
    }
    const sofar = totalCostByPr.has(run.prId) ? totalCostByPr.get(run.prId)! : 0;
    totalCostByPr.set(run.prId, sofar == null || run.costUsd == null ? null : sofar + run.costUsd);
  }
  return { latestRunByPr, totalCostByPr };
}

/** A persisted PR plus its rollups → the PR-list row. */
export function toPrMeta(
  r: PullRecord,
  rollup: {
    score: number | null | undefined;
    costUsd: number | null | undefined;
    latestRun: LatestRun | undefined;
    preview: PrMeta['findings_preview'];
    now: number;
  },
): PrMeta {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    author: r.author,
    branch: r.branch,
    base: r.base,
    head_sha: r.headSha,
    additions: r.additions,
    deletions: r.deletions,
    files_count: r.filesCount,
    status: deriveReviewStatus({
      ghStatus: r.status,
      lastReviewedSha: r.lastReviewedSha,
      headSha: r.headSha,
      updatedAt: r.updatedAt,
      now: rollup.now,
    }),
    opened_at: r.openedAt?.toISOString() ?? null,
    updated_at: r.updatedAt?.toISOString() ?? null,
    score: rollup.score ?? null,
    cost_usd: rollup.costUsd ?? null,
    findings_by_severity: rollup.latestRun?.findingsBySeverity ?? null,
    findings_preview: rollup.latestRun ? rollup.preview : [],
  };
}

/** A persisted PR with its stored files/commits → PR detail (offline fallback). */
export function toPersistedDetail(
  pr: PullRecord,
  files: PrDetail['files'],
  commits: PrDetail['commits'],
): PrDetail {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    branch: pr.branch,
    base: pr.base,
    head_sha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files_count: pr.filesCount,
    status: pr.status as PrDetail['status'],
    opened_at: pr.openedAt?.toISOString() ?? null,
    updated_at: pr.updatedAt?.toISOString() ?? null,
    body: pr.body ?? null,
    files,
    commits,
  };
}
