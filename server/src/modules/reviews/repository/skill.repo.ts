import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { PromptSkill } from '../domain.js';

// ---- skills injected into a review (L02) ----------------------------------

/**
 * The agent's linked skills that are also globally enabled, in link order —
 * exactly what reaches the prompt. Nothing downstream re-sorts this list.
 */
export async function promptSkillsForAgent(db: Db, agentId: string): Promise<PromptSkill[]> {
  return db
    .select({ name: t.skills.name, version: t.skills.version, body: t.skills.body })
    .from(t.agentSkills)
    .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
    .where(and(eq(t.agentSkills.agentId, agentId), eq(t.skills.enabled, true)))
    .orderBy(asc(t.agentSkills.order));
}
