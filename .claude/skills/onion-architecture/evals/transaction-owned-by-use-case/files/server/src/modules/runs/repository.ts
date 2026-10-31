import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Finding } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class RunRepository {
  constructor(private readonly db: Db) {}

  async saveFindings(runId: string, items: Finding[]): Promise<void> {
    if (items.length === 0) return;
    await this.db.insert(t.findings).values(items.map((f) => ({ id: randomUUID(), runId, ...f })));
  }

  async markDone(runId: string, summary: { count: number }): Promise<void> {
    await this.db.update(t.runs).set({ status: 'done', summary, finishedAt: new Date() }).where(eq(t.runs.id, runId));
  }
}
