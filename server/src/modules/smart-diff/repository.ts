import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ChangedFile, FindingRef, ReviewFindings } from './domain.js';

/**
 * L03 — smart-diff data-access. Read-only: `pull_requests` (workspace-scoped), `pr_files`
 * (without the patch) and the PR's reviews with their findings' file, line and dismissal.
 */
export class SmartDiffRepository {
  constructor(private readonly db: Db) {}

  /** The PR's id when it belongs to the workspace, else `undefined`. */
  async findPull(workspaceId: string, prId: string): Promise<{ id: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async files(prId: string): Promise<ChangedFile[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  /** The PR's reviews, newest first (the id breaks a tie on `created_at`). */
  async reviews(prId: string): Promise<ReviewFindings[]> {
    const reviewRows = await this.db
      .select({ id: t.reviews.id, agentId: t.reviews.agentId, createdAt: t.reviews.createdAt })
      .from(t.reviews)
      .where(eq(t.reviews.prId, prId))
      .orderBy(desc(t.reviews.createdAt), desc(t.reviews.id));
    if (reviewRows.length === 0) return [];

    const findingRows = await this.db
      .select({
        reviewId: t.findings.reviewId,
        file: t.findings.file,
        startLine: t.findings.startLine,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .where(
        inArray(
          t.findings.reviewId,
          reviewRows.map((r) => r.id),
        ),
      );

    const byReview = new Map<string, FindingRef[]>();
    for (const row of findingRows) {
      const list = byReview.get(row.reviewId) ?? [];
      list.push({ file: row.file, startLine: row.startLine, dismissedAt: row.dismissedAt });
      byReview.set(row.reviewId, list);
    }
    return reviewRows.map((r) => ({
      agentId: r.agentId,
      createdAt: r.createdAt,
      findings: byReview.get(r.id) ?? [],
    }));
  }
}
