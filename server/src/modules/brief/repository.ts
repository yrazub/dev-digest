import { and, asc, desc, eq } from 'drizzle-orm';
import { PrBriefRecord, Severity } from '@devdigest/shared';
import type { FeatureModelChoice } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { resolveFeatureModel } from '../_shared/repository/feature-models.repo.js';
import type { BriefPull, BriefStore } from './ports.js';

/**
 * L05 — brief data-access. Owns `pr_brief`; reads `pull_requests` (workspace-scoped), `repos`,
 * `pr_files`, the newest completed `reviews` row with its `findings`, and the workspace's
 * `risk_brief` model choice. `json` holds a contract shape the database does not enforce, so
 * `readBrief` parses it; a row that fails is reported through `onUnreadable` and not returned.
 */

/** What is stored: the record without the `stale` flag, which is computed on read. */
const StoredBrief = PrBriefRecord.omit({ stale: true });
type StoredBriefRecord = Omit<PrBriefRecord, 'stale'>;

export class BriefRepository implements BriefStore {
  constructor(private readonly db: Db) {}

  async findPull(workspaceId: string, prId: string): Promise<BriefPull | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        headSha: t.pullRequests.headSha,
        additions: t.pullRequests.additions,
        deletions: t.pullRequests.deletions,
        filesCount: t.pullRequests.filesCount,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    const { owner, name, clonePath, ...pull } = row;
    return { ...pull, repo: { owner, name, clonePath } };
  }

  async changedFiles(prId: string) {
    // `pr_files` has no order column; the path order keeps the prompt stable.
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));
  }

  async latestReviewFindings(prId: string) {
    // A review row is written before its run is marked `done`, so only the run's status says
    // the review completed; a review of a running, failed or cancelled run is skipped.
    const [review] = await this.db
      .select({ id: t.reviews.id })
      .from(t.reviews)
      .innerJoin(t.agentRuns, eq(t.agentRuns.id, t.reviews.runId))
      .where(and(eq(t.reviews.prId, prId), eq(t.reviews.kind, 'review'), eq(t.agentRuns.status, 'done')))
      .orderBy(desc(t.reviews.createdAt), desc(t.reviews.id))
      .limit(1);
    if (!review) return [];

    const rows = await this.db
      .select({
        file: t.findings.file,
        line: t.findings.startLine,
        severity: t.findings.severity,
        title: t.findings.title,
        dismissedAt: t.findings.dismissedAt,
      })
      .from(t.findings)
      .where(eq(t.findings.reviewId, review.id))
      .orderBy(asc(t.findings.file), asc(t.findings.startLine), asc(t.findings.title));

    return rows.flatMap((row) => {
      const severity = Severity.safeParse(row.severity);
      if (!severity.success) return [];
      return [
        {
          file: row.file,
          line: row.line,
          severity: severity.data,
          title: row.title,
          dismissed: row.dismissedAt !== null,
        },
      ];
    });
  }

  featureModel(workspaceId: string): Promise<FeatureModelChoice> {
    return resolveFeatureModel(this.db, workspaceId, 'risk_brief');
  }

  async readBrief(prId: string, opts: { onUnreadable: () => void }): Promise<StoredBriefRecord | undefined> {
    const [row] = await this.db.select({ json: t.prBrief.json }).from(t.prBrief).where(eq(t.prBrief.prId, prId));
    if (!row) return undefined;
    const parsed = StoredBrief.safeParse(row.json);
    if (!parsed.success) {
      opts.onUnreadable();
      return undefined;
    }
    return parsed.data;
  }

  async saveBrief(prId: string, record: StoredBriefRecord): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: record })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: record } });
  }
}
