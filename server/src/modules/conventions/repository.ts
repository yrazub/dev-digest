import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Skill } from '@devdigest/shared';
import { skillRowToDto } from '../_shared/skill-dto.js';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRecord, VerifiedCandidate } from './domain.js';
import type {
  ConventionChanges,
  ConventionStore,
  ConventionsUnitOfWork,
  NewExtractedSkill,
  ScanInfoRecord,
  ScanRepo,
} from './ports.js';

/**
 * L02 — conventions data-access. Owns `conventions`; reads `repos` and
 * `repo_index_state`; keeps per-repo scan info in `settings` under
 * `conventions_scan:<repoId>`; writes a new `skills` row + its v1 in
 * `skill_versions` when accepted candidates become a skill. Workspace-scoped throughout.
 */

type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];
type Row = typeof t.conventions.$inferSelect;

const scanKey = (repoId: string) => `conventions_scan:${repoId}`;

/** The jsonb value stored under `conventions_scan:<repoId>`. */
const StoredScanInfo = z.object({ last_scan_at: z.string(), sampled_files: z.number().int() });

function toRecord(row: Row): ConventionRecord {
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    evidencePath: row.evidencePath,
    evidenceLineStart: row.evidenceLineStart,
    evidenceLineEnd: row.evidenceLineEnd,
    evidenceSnippet: row.evidenceSnippet,
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
    if (!row) return undefined;
    // Every candidate is written with its repo; a row without one is not reachable from any page.
    if (!row.repoId) throw new Error(`Convention ${id} has no repo`);
    return { record: toRecord(row), repoId: row.repoId };
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
    const parsed = StoredScanInfo.safeParse(row?.value);
    if (!parsed.success) return undefined;
    return { lastScanAt: parsed.data.last_scan_at, sampledFiles: parsed.data.sampled_files };
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

  async skillNames(workspaceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: t.skills.name })
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId));
    return rows.map((r) => r.name);
  }

  async insertSkill(skill: NewExtractedSkill): Promise<Skill> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: skill.workspaceId,
        name: skill.name,
        description: skill.description,
        type: skill.type,
        source: 'extracted',
        body: skill.body,
        enabled: skill.enabled,
        version: 1,
        evidenceFiles: skill.evidenceFiles,
      })
      .returning();
    await this.db.insert(t.skillVersions).values({ skillId: row!.id, version: 1, body: skill.body });
    return skillRowToDto(row!, 0);
  }
}

export const drizzleConventionsUnitOfWork = (db: Db): ConventionsUnitOfWork => ({
  run: (work) => db.transaction((tx) => work(new ConventionsRepository(tx))),
});
