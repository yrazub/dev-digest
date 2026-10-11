import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BlastStore } from './ports.js';

/**
 * L04 — blast data-access. Read-only: `pull_requests` (workspace-scoped) and the `path` of
 * `pr_files`.
 */
export class BlastRepository implements BlastStore {
  constructor(private readonly db: Db) {}

  async findPull(workspaceId: string, prId: string): Promise<{ id: string; repoId: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  async changedPaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId))
      .orderBy(asc(t.prFiles.path));
    return rows.map((r) => r.path);
  }
}
