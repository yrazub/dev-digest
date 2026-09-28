import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * L02 — an agent's Skills tab data: every workspace skill with its link state
 * (linked first, in order), skill_count on agents, a foreign or duplicate skill
 * id rejected with 422, and the seeded Test Quality Reviewer.
 */
d('agent ↔ skills', () => {
  let pg: PgFixture;
  let app: FastifyInstance;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function skill(name: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: 'd', type: 'custom', body: 'b' },
    });
    return res.json().id;
  }

  it('seeds the Test Quality Reviewer as a fourth agent', async () => {
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(agents.map((a: { name: string }) => a.name)).toContain('Test Quality Reviewer');
    expect(agents).toHaveLength(4);
  });

  it('lists every workspace skill with link state, linked first in order', async () => {
    const a = await skill('a-skill');
    const b = await skill('b-skill');
    const c = await skill('c-skill');
    const agent = (await app.inject({ method: 'GET', url: '/agents' })).json()[0];

    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [c, a] },
    });
    expect(set.statusCode).toBe(200);

    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
    expect(list.map((s: { id: string; linked: boolean; order: number | null }) => [s.id, s.linked, s.order])).toEqual([
      [c, true, 0],
      [a, true, 1],
      [b, false, null],
    ]);
    expect(set.json()).toEqual(list);

    const got = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();
    expect(got.skill_count).toBe(2);
    const listed = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(listed.find((x: { id: string }) => x.id === agent.id).skill_count).toBe(2);
  });

  it('rejects unknown, foreign and duplicate skill ids with 422', async () => {
    const agent = (await app.inject({ method: 'GET', url: '/agents' })).json()[1];
    const own = await skill('own-skill');

    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const [foreign] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId: other!.id, name: 'foreign', description: 'd', type: 'custom', source: 'manual', body: 'b' })
      .returning();

    const post = (skill_ids: string[]) =>
      app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids } });

    expect((await post([foreign!.id])).statusCode).toBe(422);
    expect((await post(['00000000-0000-0000-0000-000000000000'])).statusCode).toBe(422);
    expect((await post([own, own])).statusCode).toBe(422);
    expect((await post([])).statusCode).toBe(200);
  });
});
