import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * L05 phase 4 — the migration that adds `agent_context_docs` and `skill_context_docs`
 * applies on a fresh database; a path is unique per owner; deleting the owner deletes
 * its attachments (groundwork for R-SRV-12, R-SRV-20). Rows are created here, never
 * taken from the seed.
 */
d('project-context tables', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select({ id: t.workspaces.id }).from(t.workspaces).limit(1);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function newAgent(name: string): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name, provider: 'openai', model: 'gpt-4o', systemPrompt: 'p' })
      .returning({ id: t.agents.id });
    return row!.id;
  }
  async function newSkill(name: string): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name, description: 'd', type: 'custom', source: 'manual', body: 'b' })
      .returning({ id: t.skills.id });
    return row!.id;
  }

  it('stores ordered paths per agent, rejects a duplicate path, and cascades on agent delete', async () => {
    const { db } = pg.handle;
    const agentId = await newAgent('ctx-schema-agent');
    await db.insert(t.agentContextDocs).values([
      { agentId, path: 'docs/b.md', order: 1 },
      { agentId, path: 'docs/a.md', order: 0 },
    ]);

    const rows = await db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId))
      .orderBy(t.agentContextDocs.order);
    expect(rows.map((r) => r.path)).toEqual(['docs/a.md', 'docs/b.md']);

    await expect(
      db.insert(t.agentContextDocs).values({ agentId, path: 'docs/a.md', order: 2 }),
    ).rejects.toThrow();

    await db.delete(t.agents).where(eq(t.agents.id, agentId));
    expect(
      await db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId)),
    ).toEqual([]);
  });

  it('stores ordered paths per skill, rejects a duplicate path, and cascades on skill delete', async () => {
    const { db } = pg.handle;
    const skillId = await newSkill('ctx-schema-skill');
    await db.insert(t.skillContextDocs).values([
      { skillId, path: 'specs/y.md', order: 1 },
      { skillId, path: 'specs/x.md', order: 0 },
    ]);

    const rows = await db
      .select()
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(t.skillContextDocs.order);
    expect(rows.map((r) => r.path)).toEqual(['specs/x.md', 'specs/y.md']);

    await expect(
      db.insert(t.skillContextDocs).values({ skillId, path: 'specs/x.md', order: 2 }),
    ).rejects.toThrow();

    await db.delete(t.skills).where(eq(t.skills.id, skillId));
    expect(
      await db.select().from(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId)),
    ).toEqual([]);
  });

  it('lets two owners attach the same path, and a delete touches only its own rows', async () => {
    const { db } = pg.handle;
    const a1 = await newAgent('ctx-schema-a1');
    const a2 = await newAgent('ctx-schema-a2');
    await db.insert(t.agentContextDocs).values([
      { agentId: a1, path: 'docs/shared.md', order: 0 },
      { agentId: a2, path: 'docs/shared.md', order: 0 },
    ]);
    await db.delete(t.agents).where(eq(t.agents.id, a1));
    const left = await db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, a2));
    expect(left).toHaveLength(1);
  });

  it('rejects an attachment whose owner does not exist', async () => {
    await expect(
      pg.handle.db.insert(t.agentContextDocs).values({
        agentId: '00000000-0000-0000-0000-000000000000',
        path: 'docs/a.md',
        order: 0,
      }),
    ).rejects.toThrow();
  });
});
