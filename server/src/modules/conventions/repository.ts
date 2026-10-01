import { and, desc, eq, sql } from 'drizzle-orm';
import type { ConventionCategory } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRecord } from './domain.js';
import type {
  ConventionChanges,
  ConventionStore,
  ConventionsUnitOfWork,
  ScanInfoRecord,
  ScanRepo,
} from './ports.js';
import type { VerifiedCandidate } from './verify.js';

/**
 * L02 — conventions data-access. Owns `conventions`; reads `repos` and
 * `repo_index_state`; keeps per-repo scan info in `settings` under
 * `conventions_scan:<repoId>`. Workspace-scoped throughout.
 */

type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
type Row = typeof t.conventions.$inferSelect;

const scanKey = (repoId: string) => `conventions_scan:${repoId}`;

function toRecord(row: Row): ConventionRecord {
  return {
    id: row.id,
    category: row.category as ConventionCategory,
    rule: row.rule,
    evidencePath: row.evidencePath ?? '',
    evidenceLineStart: row.evidenceLineStart,
    evidenceLineEnd: row.evidenceLineEnd,
    evidenceSnippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    status: row.status,
  };
}

export class ConventionsRepository implements ConventionStore {
  constructor(private readonly db: Executor) {}

  async findRepo(workspaceId: string, repoId: string): Promise<ScanRepo | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        indexedSha: t.repoIndexState.lastIndexedSha,
      })
      .from(t.repos)
      .leftJoin(t.repoIndexState, eq(t.repoIndexState.repoId, t.repos.id))
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ? { ...row, indexedSha: row.indexedSha ?? null } : undefined;
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionRecord[]> {
    const rows = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(
        sql`case ${t.conventions.status} when 'pending' then 0 when 'accepted' then 1 else 2 end`,
        desc(t.conventions.confidence),
        t.conventions.createdAt,
      );
    return rows.map(toRecord);
  }

  async find(
    workspaceId: string,
    id: string,
  ): Promise<{ record: ConventionRecord; repoId: string } | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row?.repoId ? { record: toRecord(row), repoId: row.repoId } : undefined;
  }

  async update(workspaceId: string, id: string, changes: ConventionChanges): Promise<void> {
    await this.db
      .update(t.conventions)
      .set(changes)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
  }

  async deletePending(workspaceId: string, repoId: string): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'pending'),
        ),
      );
  }

  async insertMany(workspaceId: string, repoId: string, rows: VerifiedCandidate[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(t.conventions).values(
      rows.map((r) => ({
        workspaceId,
        repoId,
        category: r.category,
        rule: r.rule,
        evidencePath: r.evidencePath,
        evidenceLineStart: r.evidenceLineStart,
        evidenceLineEnd: r.evidenceLineEnd,
        evidenceSnippet: r.evidenceSnippet,
        confidence: r.confidence,
      })),
    );
  }

  async getScanInfo(workspaceId: string, repoId: string): Promise<ScanInfoRecord | undefined> {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, scanKey(repoId))));
    const v = row?.value as { last_scan_at?: unknown; sampled_files?: unknown } | undefined;
    if (typeof v?.last_scan_at !== 'string' || typeof v.sampled_files !== 'number') return undefined;
    return { lastScanAt: v.last_scan_at, sampledFiles: v.sampled_files };
  }

  async saveScanInfo(
    workspaceId: string,
    userId: string,
    repoId: string,
    info: ScanInfoRecord,
  ): Promise<void> {
    const value = { last_scan_at: info.lastScanAt, sampled_files: info.sampledFiles };
    await this.db
      .insert(t.settings)
      .values({ workspaceId, userId, key: scanKey(repoId), value })
      .onConflictDoUpdate({
        target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
        set: { value },
      });
  }
}

export const drizzleConventionsUnitOfWork = (db: Db): ConventionsUnitOfWork => ({
  run: (work) => db.transaction((tx) => work(new ConventionsRepository(tx))),
});
