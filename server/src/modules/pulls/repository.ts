import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FindingRecord, PrDetail, PrMeta } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { findingRowToDto } from '../_shared/finding-dto.js';
import type { CompletedRunRow, PullRecord, RepoRecord, ReviewScoreRow } from './domain.js';

/**
 * F1 — pulls data-access layer. Owns `pull_requests`, `pr_files` and
 * `pr_commits`, and reads the review/run rollups the PR list shows. Lookups
 * are scoped by `workspaceId` (tenancy guard).
 */

export class PullsRepository {
  constructor(private db: Db) {}

  async findRepo(workspaceId: string, repoId: string): Promise<RepoRecord | undefined> {
    const [repo] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return repo;
  }

  /** A PR in a workspace plus its repo; `repo` is undefined if the repo row is gone. */
  async findPull(
    workspaceId: string,
    prId: string,
  ): Promise<{ pr: PullRecord; repo: RepoRecord | undefined } | undefined> {
    const [pr] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pr) return undefined;
    const [repo] = await this.db.select().from(t.repos).where(eq(t.repos.id, pr.repoId));
    return { pr, repo };
  }

  /** Idempotent import of GitHub's PR list (unique repo_id + number). */
  async upsertFromGitHub(workspaceId: string, repoId: string, pulls: PrMeta[]): Promise<void> {
    for (const pr of pulls) {
      await this.db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId,
          number: pr.number,
          title: pr.title,
          author: pr.author,
          branch: pr.branch,
          base: pr.base,
          headSha: pr.head_sha,
          additions: pr.additions,
          deletions: pr.deletions,
          filesCount: pr.files_count,
          status: pr.status,
          openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
          updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
        })
        .onConflictDoUpdate({
          target: [t.pullRequests.repoId, t.pullRequests.number],
          set: {
            title: pr.title,
            headSha: pr.head_sha,
            status: pr.status,
            updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
          },
        });
    }
  }

  async listByRepo(repoId: string): Promise<PullRecord[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  async setDiffStats(
    prId: string,
    stats: { additions: number; deletions: number; filesCount: number },
  ): Promise<void> {
    await this.db.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, prId));
  }

  /** Review scores for these PRs, newest first. */
  async reviewScores(prIds: string[]): Promise<ReviewScoreRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  /** Completed (status='done') runs for these PRs, newest first. */
  async completedRuns(prIds: string[]): Promise<CompletedRunRow[]> {
    if (prIds.length === 0) return [];
    const rows = await this.db
      .select({
        prId: t.agentRuns.prId,
        runId: t.agentRuns.id,
        costUsd: t.agentRuns.costUsd,
        findingsBySeverity: t.agentRuns.findingsBySeverity,
      })
      .from(t.agentRuns)
      .where(and(inArray(t.agentRuns.prId, prIds), eq(t.agentRuns.status, 'done')))
      .orderBy(desc(t.agentRuns.ranAt));
    return rows.map((r) => ({ ...r, findingsBySeverity: r.findingsBySeverity ?? null }));
  }

  /** The findings behind each run (via its review), grouped by run id. */
  async findingsByRun(runIds: string[]): Promise<Map<string, FindingRecord[]>> {
    const out = new Map<string, FindingRecord[]>();
    if (runIds.length === 0) return out;
    const rows = await this.db
      .select({ runId: t.reviews.runId, finding: t.findings })
      .from(t.reviews)
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(inArray(t.reviews.runId, runIds));
    for (const row of rows) {
      if (!row.runId) continue;
      const list = out.get(row.runId) ?? [];
      list.push(findingRowToDto(row.finding));
      out.set(row.runId, list);
    }
    return out;
  }

  /** Replace a PR's stored files/commits and refresh its body + diff stats from a GitHub detail. */
  async saveDetail(prId: string, detail: PrDetail): Promise<void> {
    await this.db.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
    if (detail.files.length > 0) {
      await this.db.insert(t.prFiles).values(
        detail.files.map((f) => ({
          prId,
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
      );
    }
    await this.db.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
    if (detail.commits.length > 0) {
      await this.db.insert(t.prCommits).values(
        detail.commits.map((c) => ({
          prId,
          sha: c.sha,
          message: c.message,
          author: c.author,
          committedAt: c.committed_at ? new Date(c.committed_at) : null,
        })),
      );
    }
    await this.db
      .update(t.pullRequests)
      .set({
        body: detail.body ?? null,
        // Diff stats aren't on GitHub's PR-list payload — backfill them from
        // the detail fetch so the Pull Requests list shows real size/files.
        additions: detail.additions,
        deletions: detail.deletions,
        filesCount: detail.files_count,
      })
      .where(eq(t.pullRequests.id, prId));
  }

  /** The files/commits stored for a PR, in wire shape. */
  async storedFilesAndCommits(
    prId: string,
  ): Promise<{ files: PrDetail['files']; commits: PrDetail['commits'] }> {
    const files = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    const commits = await this.db.select().from(t.prCommits).where(eq(t.prCommits.prId, prId));
    return {
      files: files.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
      commits: commits.map((c) => ({
        sha: c.sha,
        message: c.message,
        author: c.author,
        committed_at: c.committedAt?.toISOString() ?? null,
      })),
    };
  }
}
