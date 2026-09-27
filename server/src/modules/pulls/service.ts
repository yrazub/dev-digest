import type { GitHubClient, PrCommentInput, PrDetail, PrMeta, PrReviewComment } from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import type { PullsRepository } from './repository.js';
import {
  latestScoreByPr,
  pickNeedingDiffStats,
  summarizeCompletedRuns,
  toPersistedDetail,
  toPrMeta,
  type PullRecord,
  type RepoRecord,
} from './domain.js';

export interface PullsLogger {
  warn: (obj: unknown, msg?: string) => void;
}

export interface PullsServiceDeps {
  repo: PullsRepository;
  /** Lazy: throws when no GitHub token is configured. */
  github: () => Promise<GitHubClient>;
  log: PullsLogger;
}

/**
 * F1 — pulls service. PR import from GitHub (list + per-PR detail) and the
 * live-proxied inline review comments.
 *
 * Local-first: GitHub is synced when a token is configured, but reads never
 * fail on it — already-imported/seeded PRs stay viewable offline. Review
 * trigger is MANUAL and owned by `reviews`; this module only imports/reads.
 */
export class PullsService {
  constructor(private deps: PullsServiceDeps) {}

  async listForRepo(workspaceId: string, repoId: string): Promise<PrMeta[]> {
    const { repo: store, log } = this.deps;
    const repo = await store.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    let gh: GitHubClient | null = null;
    try {
      gh = await this.deps.github();
    } catch (err) {
      log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    }

    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        await store.upsertFromGitHub(workspaceId, repo.id, pulls);
      } catch (err) {
        log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await store.listByRepo(repo.id);
    if (gh) await this.backfillDiffStats(gh, repo, rows);

    const prIds = rows.map((r) => r.id);
    const scores = latestScoreByPr(await store.reviewScores(prIds));
    const { latestRunByPr, totalCostByPr } = summarizeCompletedRuns(await store.completedRuns(prIds));
    const previewByRun = await store.findingsByRun([...latestRunByPr.values()].map((r) => r.runId));

    const now = Date.now();
    return rows.map((r) => {
      const latestRun = latestRunByPr.get(r.id);
      return toPrMeta(r, {
        score: scores.get(r.id),
        costUsd: totalCostByPr.get(r.id),
        latestRun,
        preview: latestRun ? (previewByRun.get(latestRun.runId) ?? []) : [],
        now,
      });
    });
  }

  /**
   * Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs land
   * with zeroed size/diff. Backfill them from the detail endpoint, capped per
   * request — the periodic refetch chips away at any remainder. Mutates `rows`.
   */
  private async backfillDiffStats(gh: GitHubClient, repo: RepoRecord, rows: PullRecord[]) {
    for (const r of pickNeedingDiffStats(rows)) {
      try {
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
        const stats = {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        };
        await this.deps.repo.setDiffStats(r.id, stats);
        Object.assign(r, stats);
      } catch (err) {
        this.deps.log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
      }
    }
  }

  async getDetail(workspaceId: string, prId: string): Promise<PrDetail> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    try {
      const gh = await this.deps.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.deps.repo.saveDetail(pr.id, detail);
      return { ...detail, id: pr.id };
    } catch (err) {
      this.deps.log.warn(
        { err },
        'GitHub PR detail refresh skipped (no token / offline); serving persisted detail',
      );
      const { files, commits } = await this.deps.repo.storedFilesAndCommits(pr.id);
      return toPersistedDetail(pr, files, commits);
    }
  }

  // Inline review comments are proxied live to GitHub (no local persistence),
  // keeping the Files-changed tab in lock-step with GitHub.

  async listComments(workspaceId: string, prId: string): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub client unavailable; serving no PR comments');
      return [];
    }
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      this.deps.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async postComment(
    workspaceId: string,
    prId: string,
    input: PrCommentInput,
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, prId);
    let gh: GitHubClient;
    try {
      gh = await this.deps.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }

  private async resolvePrAndRepo(workspaceId: string, prId: string) {
    const found = await this.deps.repo.findPull(workspaceId, prId);
    if (!found) throw new NotFoundError('Pull request not found');
    if (!found.repo) throw new NotFoundError('Repo not found');
    return { pr: found.pr, repo: found.repo };
  }
}
