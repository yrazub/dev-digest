/**
 * The seeded PR Brief of PR #482 (`seed()` in `src/db/seed.ts`) against a real Postgres.
 * Spec: `server/specs/L05-pr-brief.md` ("Seeded brief", R-SRV-41); plan: `specs/plans/L05-pr-brief.md`,
 * phase 5. `GET /pulls/:id/brief` runs on the built app through `app.inject`, with an empty
 * `MockSecretsProvider` (so `~/.devdigest/secrets.json` is never read), `MockGitHubClient` and
 * `MockLLMProvider` — no key, no network.
 * Not covered here: the generated brief (`brief.it.test.ts`); the contents of every seeded string
 * (the e2e fixtures in `e2e/specs/seed-fixtures.md` own them).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { PrBriefRecord } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const SEEDED_HEAD_SHA = 'a1b2c3d4e5f6';

/** A double whose every method call, of any method, is recorded by name. */
function counting<T extends object>(inner: T) {
  const calls: string[] = [];
  const proxy = new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.push(String(prop));
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { proxy, calls };
}

d('L05 seeded brief (Testcontainers pg)', () => {
  let pg: PgFixture;
  let seededPrId: string;
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [seeded] = await pg.handle.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.repos.fullName, 'acme/payments-api'), eq(t.pullRequests.number, 482)));
    seededPrId = seeded!.id;
  });

  afterAll(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
    await pg?.stop();
  });

  const rowsFor = (prId: string) => pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));

  it('two seed() calls leave exactly one brief row for PR #482, valid against the contract, with the seeded head SHA', async () => {
    await seed(pg.handle.db);
    await seed(pg.handle.db);

    const rows = await rowsFor(seededPrId);
    expect(rows).toHaveLength(1);

    const parsed = PrBriefRecord.omit({ stale: true }).safeParse(rows[0]!.json);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
    expect(parsed.data).toMatchObject({ pr_id: seededPrId, head_sha: SEEDED_HEAD_SHA });

    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.id, seededPrId));
    expect(parsed.data!.head_sha).toBe(pr!.headSha);
  });

  it('GET answers the seeded brief with stale false and makes no model call and no GitHub call', async () => {
    const llm = new MockLLMProvider('openai');
    const github = counting(new MockGitHubClient());
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { secrets: new MockSecretsProvider(), github: github.proxy, llm: { openai: llm } },
    });
    apps.push(app);

    const res = await app.inject({ method: 'GET', url: `/pulls/${seededPrId}/brief` });
    expect(res.statusCode).toBe(200);

    const [row] = await rowsFor(seededPrId);
    expect(res.json()).toEqual({ brief: { ...(row!.json as object), stale: false } });
    expect(res.json().brief).toMatchObject({ head_sha: SEEDED_HEAD_SHA, provider: 'seed', model: 'seed' });
    expect(llm.calls).toEqual([]);
    expect(github.calls).toEqual([]);
  });

  it('a seeded row that was changed is left unchanged by another seed()', async () => {
    const [before] = await rowsFor(seededPrId);
    const changed = { ...(before!.json as object), summary: 'Edited by a test; a re-seed must not restore the seeded text.' };
    await pg.handle.db.update(t.prBrief).set({ json: changed }).where(eq(t.prBrief.prId, seededPrId));

    try {
      await seed(pg.handle.db);

      const rows = await rowsFor(seededPrId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.json).toEqual(changed);
    } finally {
      await pg.handle.db.update(t.prBrief).set({ json: before!.json }).where(eq(t.prBrief.prId, seededPrId));
    }
  });
});
