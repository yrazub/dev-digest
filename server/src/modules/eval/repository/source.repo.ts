import { and, asc, eq } from 'drizzle-orm';
import type { FindingCategory, Severity } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { EvalFindingSource } from '../ports.js';

/**
 * Reads of rows the eval module does not own: the finding with its review, pull request and
 * repository, the agent, and the pull request's stored patches. The module's own copies (R2).
 */

export async function findFindingSource(
  db: Db,
  workspaceId: string,
  findingId: string,
): Promise<EvalFindingSource | undefined> {
  const [row] = await db
    .select({
      id: t.findings.id,
      file: t.findings.file,
      startLine: t.findings.startLine,
      endLine: t.findings.endLine,
      title: t.findings.title,
      severity: t.findings.severity,
      category: t.findings.category,
      acceptedAt: t.findings.acceptedAt,
      dismissedAt: t.findings.dismissedAt,
      agentId: t.reviews.agentId,
      prId: t.pullRequests.id,
      prNumber: t.pullRequests.number,
      prTitle: t.pullRequests.title,
      prBody: t.pullRequests.body,
      prAuthor: t.pullRequests.author,
      prBase: t.pullRequests.base,
      prHeadSha: t.pullRequests.headSha,
      owner: t.repos.owner,
      name: t.repos.name,
    })
    .from(t.findings)
    .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
    .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
    .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.findings.id, findingId)));
  if (!row) return undefined;
  return {
    id: row.id,
    file: row.file,
    startLine: row.startLine,
    endLine: row.endLine,
    title: row.title,
    severity: row.severity as Severity,
    category: row.category as FindingCategory,
    accepted: row.acceptedAt !== null,
    dismissed: row.dismissedAt !== null,
    agentId: row.agentId,
    pull: {
      id: row.prId,
      number: row.prNumber,
      title: row.prTitle,
      body: row.prBody,
      author: row.prAuthor,
      base: row.prBase,
      headSha: row.prHeadSha,
    },
    repo: { owner: row.owner, name: row.name },
  };
}

export async function agentExists(db: Db, workspaceId: string, agentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: t.agents.id })
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
  return row !== undefined;
}

export async function prPatches(
  db: Db,
  prId: string,
): Promise<{ path: string; patch: string | null }[]> {
  return db
    .select({ path: t.prFiles.path, patch: t.prFiles.patch })
    .from(t.prFiles)
    .where(eq(t.prFiles.prId, prId))
    .orderBy(asc(t.prFiles.path));
}
