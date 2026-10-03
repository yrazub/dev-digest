import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ConventionSkillDraft, Skill } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions-skill] Docker not available — skipping integration tests.');
}

/**
 * Accepted candidates → skill draft → created skill, on real Postgres: the
 * draft carries only accepted rules · rejected or pending ids → 422 · create
 * writes the skill (source extracted) and v1 atomically · it shows in
 * GET /skills and can be linked to an agent · duplicate name → 409.
 */
d('conventions → skill', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let repoId: string;
  const ids: Record<'acceptedA' | 'acceptedB' | 'rejected' | 'pending', string> = {} as never;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'api', fullName: 'acme/api' })
      .returning();
    repoId = repo!.id;
    const row = (rule: string, status: 'accepted' | 'rejected' | 'pending', path: string) => ({
      workspaceId,
      repoId,
      category: 'error-handling',
      rule,
      evidencePath: path,
      evidenceLineStart: 4,
      evidenceLineEnd: 4,
      evidenceSnippet: "throw new NotFoundError('User not found');",
      confidence: 0.9,
      status,
    });
    const inserted = await db
      .insert(t.conventions)
      .values([
        row('Throw NotFoundError when a lookup misses.', 'accepted', 'src/users/service.ts'),
        row('Wrap handlers in asyncHandler.', 'accepted', 'src/users/routes.ts'),
        row('Return null from repositories.', 'rejected', 'src/users/repo.ts'),
        row('Log every error.', 'pending', 'src/users/log.ts'),
      ])
      .returning();
    [ids.acceptedA, ids.acceptedB, ids.rejected, ids.pending] = inserted.map((r) => r.id) as [string, string, string, string];

    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const draft = (candidate_ids: string[]) =>
    app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill-draft`, payload: { candidate_ids } });

  it('drafts repo-conventions from the accepted candidates only', async () => {
    const res = await draft([ids.acceptedA, ids.acceptedB]);
    expect(res.statusCode).toBe(200);
    const body = res.json() as ConventionSkillDraft;
    expect(body).toMatchObject({ name: 'repo-conventions', type: 'convention', description: '2 house conventions extracted from acme/api' });
    expect(body.body).toContain('Throw NotFoundError when a lookup misses.');
    expect(body.body).toContain('Wrap handlers in asyncHandler.');
    expect(body.body).not.toContain('Return null from repositories.');
  });

  it('422 when a rejected or pending id is included', async () => {
    expect((await draft([ids.acceptedA, ids.rejected])).statusCode).toBe(422);
    expect((await draft([ids.pending])).statusCode).toBe(422);
  });

  it('creates the skill with v1, lists it, and lets an agent link it', async () => {
    const { body } = (await draft([ids.acceptedA, ids.acceptedB])).json() as ConventionSkillDraft;
    const edited = `${body}\n## Extra\n\nHand-written note.\n`;
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: {
        candidate_ids: [ids.acceptedA, ids.acceptedB],
        name: 'repo-conventions',
        description: 'House rules',
        type: 'convention',
        body: edited,
        enabled: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const skill = res.json() as Skill;
    expect(skill).toMatchObject({
      name: 'repo-conventions',
      source: 'extracted',
      type: 'convention',
      version: 1,
      body: edited,
      evidence_files: ['src/users/service.ts', 'src/users/routes.ts'],
      agent_count: 0,
    });

    const versions = await pg.handle.db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, skill.id));
    expect(versions.map((v) => [v.version, v.body])).toEqual([[1, edited]]);

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json() as Skill[];
    expect(list.map((s) => s.name)).toContain('repo-conventions');

    const [agent] = await pg.handle.db.select().from(t.agents).limit(1);
    const link = await app.inject({ method: 'POST', url: `/agents/${agent!.id}/skills`, payload: { skill_ids: [skill.id] } });
    expect(link.statusCode).toBe(200);
  });

  it('the next draft falls back to <repo>-conventions, and a taken name is 409', async () => {
    const next = (await draft([ids.acceptedA])).json() as ConventionSkillDraft;
    expect(next.name).toBe('api-conventions');
    const dup = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { candidate_ids: [ids.acceptedA], name: 'repo-conventions', description: 'd', type: 'convention', body: 'b', enabled: true },
    });
    expect(dup.statusCode).toBe(409);
  });
});
