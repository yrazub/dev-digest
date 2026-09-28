import type { Skill, SkillSource, SkillType } from '@devdigest/shared';

/**
 * Persisted skill row → the `Skill` wire contract. Shared by `skills` (CRUD)
 * and `agents` (an agent's Skills tab lists every workspace skill), so it lives
 * here rather than in either module.
 *
 * The input is structural — a persisted skill's columns — so this file does not
 * import `src/db`; a Drizzle skills row satisfies it as-is.
 */
export interface PersistedSkill {
  id: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
  createdAt: Date;
}

export function skillRowToDto(row: PersistedSkill, agentCount: number): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    agent_count: agentCount,
    created_at: row.createdAt.toISOString(),
  };
}
