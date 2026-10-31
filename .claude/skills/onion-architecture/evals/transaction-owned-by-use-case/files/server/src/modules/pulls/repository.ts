import { eq } from 'drizzle-orm';
import type { PullRequest } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullStore } from './ports.js';

function toContract(row: typeof t.pullRequests.$inferSelect): PullRequest {
  return {
    id: row.id,
    repo_id: row.repoId,
    number: row.number,
    title: row.title,
    state: row.state as PullRequest['state'],
    merged_at: row.mergedAt ? row.mergedAt.toISOString() : null,
  };
}

export class PullRepository implements PullStore {
  constructor(private readonly db: Db) {}

  async listByRepo(repoId: string): Promise<PullRequest[]> {
    const rows = await this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
    return rows.map(toContract);
  }
}
