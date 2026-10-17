import { and, asc, eq, notInArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  ContextRepo,
  ProjectContextStore,
  ProjectContextUnitOfWork,
  UsedByCounts,
} from './ports.js';

/**
 * L05 — project-context data-access. Owns `agent_context_docs` and
 * `skill_context_docs` (paths and order only, never document text); reads
 * `repos`, `agents`, `skills` and `agent_skills` to scope by workspace.
 */

type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export class ProjectContextRepository implements ProjectContextStore {
  constructor(private readonly db: Executor) {}

  async findRepo(workspaceId: string, repoId: string): Promise<ContextRepo | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async agentExists(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row !== undefined;
  }

  async skillExists(workspaceId: string, skillId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return row !== undefined;
  }

  async agentPaths(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId))
      .orderBy(asc(t.agentContextDocs.order));
    return rows.map((r) => r.path);
  }

  async skillPaths(skillId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(asc(t.skillContextDocs.order));
    return rows.map((r) => r.path);
  }

  async replaceAgentPaths(agentId: string, paths: readonly string[]): Promise<void> {
    await this.db.delete(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
    if (paths.length === 0) return;
    await this.db
      .insert(t.agentContextDocs)
      .values(paths.map((path, order) => ({ agentId, path, order })));
  }

  async replaceSkillPaths(skillId: string, paths: readonly string[]): Promise<void> {
    await this.db.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
    if (paths.length === 0) return;
    await this.db
      .insert(t.skillContextDocs)
      .values(paths.map((path, order) => ({ skillId, path, order })));
  }

  /** R-SRV-15: agents directly, other agents through an enabled skill, skills. */
  async usedBy(workspaceId: string, path: string): Promise<UsedByCounts> {
    const direct = this.db
      .select({ id: t.agentContextDocs.agentId })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agentContextDocs.path, path)));

    const [directRow] = await this.db
      .select({ n: sql<number>`count(distinct ${t.agentContextDocs.agentId})::int` })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agentContextDocs.path, path)));

    const [viaRow] = await this.db
      .select({ n: sql<number>`count(distinct ${t.agentSkills.agentId})::int` })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .innerJoin(t.skillContextDocs, eq(t.skillContextDocs.skillId, t.skills.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skills.enabled, true),
          eq(t.skillContextDocs.path, path),
          notInArray(t.agentSkills.agentId, direct),
        ),
      );

    const [skillsRow] = await this.db
      .select({ n: sql<number>`count(distinct ${t.skillContextDocs.skillId})::int` })
      .from(t.skillContextDocs)
      .innerJoin(t.skills, eq(t.skills.id, t.skillContextDocs.skillId))
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skillContextDocs.path, path)));

    return {
      agentsDirect: directRow?.n ?? 0,
      agentsViaSkill: viaRow?.n ?? 0,
      skills: skillsRow?.n ?? 0,
    };
  }
}

export const drizzleProjectContextUnitOfWork = (db: Db): ProjectContextUnitOfWork => ({
  run: (work) => db.transaction((tx) => work(new ProjectContextRepository(tx))),
});
