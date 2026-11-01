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

  it('seeds the Test Quality and API Contract Reviewers as the fourth and fifth agents', async () => {
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(agents.map((a: { name: string }) => a.name)).toEqual(
      expect.arrayContaining(['Test Quality Reviewer', 'API Contract Reviewer']),
    );
    expect(agents).toHaveLength(5);
  });

  it('seeds the six docs/skills skills, linked to their agents in order', async () => {
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json() as { id: string; name: string }[];
    const linked = async (name: string) => {
      const agent = agents.find((a) => a.name === name)!;
      const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json();
      return list.filter((s: { linked: boolean }) => s.linked).map((s: { name: string; source: string }) => [s.name, s.source]);
    };
    expect(await linked('Test Quality Reviewer')).toEqual([
      ['branch-coverage', 'imported_file'],
      ['edge-cases', 'imported_file'],
    ]);
    expect((await linked('API Contract Reviewer')).map(([name]: string[]) => name)).toEqual([
      'breaking-change',
      'response-schema',
      'semver-discipline',
      'deprecation-policy',
    ]);
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
    const mine = list.filter((s: { id: string }) => [a, b, c].includes(s.id));
    expect(mine.map((s: { id: string; linked: boolean; order: number | null }) => [s.id, s.linked, s.order])).toEqual([
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

  it('counts agent_count across all agents, and keeps order through unlink and relink', async () => {
    const x = await skill('relink-x');
    const y = await skill('relink-y');
    const z = await skill('relink-z');
    const [first, second] = (await app.inject({ method: 'GET', url: '/agents' })).json() as { id: string }[];
    const get = async (agentId: string) =>
      (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json() as {
        id: string;
        linked: boolean;
        order: number | null;
        agent_count: number;
      }[];
    const mine = (list: Awaited<ReturnType<typeof get>>) => list.filter((s) => [x, y, z].includes(s.id));
    const post = (agentId: string, payload: object) =>
      app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload });

    await post(first!.id, { skill_ids: [x, y, z] });
    await post(second!.id, { skill_ids: [y] });

    // agent_count is the total link count over every agent, whoever asks.
    for (const agentId of [first!.id, second!.id]) {
      const counts = Object.fromEntries(mine(await get(agentId)).map((s) => [s.id, s.agent_count]));
      expect(counts).toEqual({ [x]: 1, [y]: 2, [z]: 1 });
    }

    // Unlink y: z moves up, y drops to the unlinked tail, and its count falls.
    await post(first!.id, { skill_ids: [x, z] });
    expect(mine(await get(first!.id)).map((s) => [s.id, s.linked, s.order, s.agent_count])).toEqual([
      [x, true, 0, 1],
      [z, true, 1, 1],
      [y, false, null, 1],
    ]);

    // Relink y with no order: it is appended after the existing links.
    const relinked = await post(first!.id, { skill_id: y });
    expect(relinked.statusCode).toBe(200);
    expect(mine(relinked.json()).map((s: { id: string; linked: boolean; order: number | null; agent_count: number }) => [s.id, s.linked, s.order, s.agent_count])).toEqual([
      [x, true, 0, 1],
      [z, true, 1, 1],
      [y, true, 2, 2],
    ]);
    expect(relinked.json()).toEqual(await get(first!.id));
  });

  it('skill_count is 0 for a new agent and counts the links on create, update and list', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'Counted', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'x' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    expect(created.json().skill_count).toBe(0);

    const s1 = await skill('count-one');
    const s2 = await skill('count-two');
    await app.inject({ method: 'POST', url: `/agents/${id}/skills`, payload: { skill_ids: [s1, s2] } });

    // PUT returns the agent with its link count, not a reset 0.
    const updated = await app.inject({ method: 'PUT', url: `/agents/${id}`, payload: { model: 'gpt-4o' } });
    expect(updated.json().skill_count).toBe(2);
    const listed = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(listed.find((x: { id: string }) => x.id === id).skill_count).toBe(2);
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
