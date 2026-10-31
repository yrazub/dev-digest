import { eq } from 'drizzle-orm';
import type { SeverityCounts } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class ReviewRepository {
  constructor(private readonly db: Db) {}

  async latestCounts(pullId: string): Promise<SeverityCounts | null> {
    const [row] = await this.db.select().from(t.reviews).where(eq(t.reviews.pullId, pullId)).limit(1);
    return row ? (row.severityCounts as SeverityCounts) : null;
  }
}
