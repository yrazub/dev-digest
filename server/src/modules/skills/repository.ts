import { and, desc, eq, sql } from 'drizzle-orm';
import type { Skill } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { skillRowToDto } from '../_shared/skill-dto.js';
import type { SkillFieldChanges } from './domain.js';
import type { NewSkill, SkillStore, SkillVersionRecord, SkillsUnitOfWork } from './ports.js';

/**
 * L02 — skills data-access. Owns `skills` and `skill_versions`; reads
 * `agent_skills` only to count links. Workspace-scoped throughout.
 */

type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export class SkillsRepository implements SkillStore {
  constructor(private readonly db: Executor) {}

  /** Skills with their link count in one grouped query. */
  private selectWithCount() {
    return this.db
      .select({
        skill: t.skills,
        agentCount: sql<number>`count(${t.agentSkills.agentId})::int`,
      })
      .from(t.skills)
      .leftJoin(t.agentSkills, eq(t.agentSkills.skillId, t.skills.id));
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.selectWithCount()
      .where(eq(t.skills.workspaceId, workspaceId))
      .groupBy(t.skills.id)
      .orderBy(t.skills.name);
    return rows.map((r) => skillRowToDto(r.skill, r.agentCount));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const [row] = await this.selectWithCount()
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .groupBy(t.skills.id);
    return row ? skillRowToDto(row.skill, row.agentCount) : undefined;
  }

  async findIdByName(workspaceId: string, name: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
    return row?.id;
  }

  async insert(skill: NewSkill): Promise<string> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: skill.workspaceId,
        name: skill.name,
        description: skill.description,
        type: skill.type,
        source: skill.source,
        body: skill.body,
        enabled: skill.enabled,
        evidenceFiles: skill.evidenceFiles,
      })
      .returning({ id: t.skills.id });
    return row!.id;
  }

  async update(workspaceId: string, id: string, changes: SkillFieldChanges): Promise<void> {
    const set = {
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.description !== undefined ? { description: changes.description } : {}),
      ...(changes.type !== undefined ? { type: changes.type } : {}),
      ...(changes.body !== undefined ? { body: changes.body } : {}),
      ...(changes.enabled !== undefined ? { enabled: changes.enabled } : {}),
      ...(changes.evidence_files !== undefined ? { evidenceFiles: changes.evidence_files } : {}),
      ...(changes.version !== undefined ? { version: changes.version } : {}),
    };
    if (Object.keys(set).length === 0) return;
    await this.db
      .update(t.skills)
      .set(set)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  async insertVersion(skillId: string, version: number, body: string, note: string | null): Promise<void> {
    await this.db.insert(t.skillVersions).values({ skillId, version, body, note });
  }

  async listVersions(skillId: string): Promise<SkillVersionRecord[]> {
    return this.db
      .select({
        version: t.skillVersions.version,
        body: t.skillVersions.body,
        note: t.skillVersions.note,
        createdAt: t.skillVersions.createdAt,
      })
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRecord | undefined> {
    const [row] = await this.db
      .select({
        version: t.skillVersions.version,
        body: t.skillVersions.body,
        note: t.skillVersions.note,
        createdAt: t.skillVersions.createdAt,
      })
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }
}

export const drizzleSkillsUnitOfWork = (db: Db): SkillsUnitOfWork => ({
  run: (work) => db.transaction((tx) => work(new SkillsRepository(tx))),
});
