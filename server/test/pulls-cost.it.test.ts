/**
 * L01 — `cost_usd` on GET /repos/:id/pulls. The list column shows the TOTAL spent
 * on a PR: the sum over all its COMPLETED runs. Running/failed runs add nothing,
 * a PR with no completed run is null, and one unpriced (null) run makes the total
 * null instead of a partial sum. Gated on Docker, like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

d('PR list cost_usd (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('serves the total cost of completed runs per PR and keeps unknown as null', async () => {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'cost-list', fullName: 'acme/cost-list' })
      .returning();

    const prIds: Record<string, string> = {};
    for (const [number, key] of [
      [1, 'newerFailed'],
      [2, 'unpriced'],
      [3, 'noRuns'],
      [4, 'newerRunning'],
      [5, 'partlyUnpriced'],
    ] as const) {
      const [pr] = await db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId: repo!.id,
          number,
          title: `PR ${number}`,
          author: 'marisa.koch',
          branch: `feat/${number}`,
          base: 'main',
          headSha: `sha${number}`,
          additions: 1,
          deletions: 0,
          filesCount: 1,
          status: 'open',
        })
        .returning();
      prIds[key] = pr!.id;
    }

    const run = (
      key: string,
      status: 'done' | 'failed' | 'running',
      costUsd: number | null,
      ranAt: Date,
    ) => ({ workspaceId, prId: prIds[key]!, status, costUsd, ranAt });

    await db.insert(t.agentRuns).values([
      // done 0.002 + done 0.005, then a failed run that adds nothing: expect 0.007
      run('newerFailed', 'done', 0.002, minutesAgo(30)),
      run('newerFailed', 'done', 0.005, minutesAgo(20)),
      run('newerFailed', 'failed', null, minutesAgo(10)),
      // a completed run whose model nobody priced: expect null, not 0
      run('unpriced', 'done', null, minutesAgo(20)),
      // done 0.003, then a newer run still in flight: expect 0.003
      run('newerRunning', 'done', 0.003, minutesAgo(20)),
      run('newerRunning', 'running', null, minutesAgo(1)),
      // one priced + one unpriced completed run: the total is unknown, not 0.004
      run('partlyUnpriced', 'done', 0.004, minutesAgo(30)),
      run('partlyUnpriced', 'done', null, minutesAgo(20)),
    ]);

    const app = await buildApp({
      config: config(),
      db,
      overrides: { github: new MockGitHubClient({ pulls: [] }) },
    });
    const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const byId = new Map((res.json() as PrMeta[]).map((p) => [p.id, p]));

    expect(byId.get(prIds.newerFailed)!.cost_usd).toBeCloseTo(0.007, 10);
    expect(byId.get(prIds.unpriced)!.cost_usd).toBeNull();
    expect(byId.get(prIds.noRuns)!.cost_usd).toBeNull();
    expect(byId.get(prIds.newerRunning)!.cost_usd).toBe(0.003);
    expect(byId.get(prIds.partlyUnpriced)!.cost_usd).toBeNull();

    await app.close();
  });
});
