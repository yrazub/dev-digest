import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ReviewRow } from '../../db/rows.js';

export class ReviewRepository {
  constructor(private readonly db: Db) {}

  async listForPull(pullId: string): Promise<ReviewRow[]> {
    return this.db.select().from(t.reviews).where(eq(t.reviews.pullId, pullId));
  }
}
