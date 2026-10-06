/**
 * `GET` / `POST /pulls/:id/intent` (`modules/intent/routes.ts`) against a real Postgres, the
 * built app and `app.inject`. The outside world is replaced through `overrides`: an empty
 * `MockSecretsProvider` (so `~/.devdigest/secrets.json` is never read), `MockGitHubClient` and
 * a `MockLLMProvider` for the `openrouter` key — no key, no network.
 * Spec: `server/specs/L03-intent-layer.md`; plan: `specs/L03-intent-layer-plan.md` (phases 5 and 10).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { IntentSource } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockLLMProvider, MockSecretsProvider, type MockGitHubOptions } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';
const OVERRIDE_MODEL = 'z-ai/glm-4.7-flash';
const SEEDED_SUMMARY = 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

const CLASSIFICATION = {
  summary: 'Adds a token-bucket rate limiter to the public API.',
  in_scope: ['Token-bucket limiter', 'Return 429 with Retry-After'],
  out_of_scope: ['Per-user limits'],
  risk_areas: [{ kind: 'api', label: 'Public API behaviour changes' }],
  basis: 'stated',
  injection_suspected: false,
};

d('L03 intent routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seededPrId: string;
  let seq = 0;
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [seeded] = await pg.handle.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.repos.fullName, 'acme/payments-api'), eq(t.pullRequests.number, 482)));
    seededPrId = seeded!.id;
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  afterAll(async () => {
    await pg?.stop();
  });

  async function appWith(o: { github?: MockGitHubOptions; fixture?: unknown; noKey?: boolean } = {}) {
    const llm = new MockLLMProvider('openrouter', {
      structuredBySchema: { IntentClassification: o.fixture ?? CLASSIFICATION },
    });
    const github = new MockGitHubClient(o.github);
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github,
        llm: o.noKey ? {} : { openrouter: llm },
      },
    });
    apps.push(app);
    return { app, llm, github };
  }

  /** A repository with one PR (body `Add rate limiting. Closes #471.`) and one changed file. */
  async function newPr() {
    const name = `intent-api-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 900 + seq,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Add rate limiting. Closes #471.',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@ export const config = {\n   port: 3000,\n+  stripeKey: "x",\n   redisUrl: x,',
    });
    return pr!;
  }

  const rowsFor = (prId: string) =>
    pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));

  it('GET returns { intent: null } for a PR with no stored intent', async () => {
    const { app } = await appWith();
    const pr = await newPr();

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ intent: null });
  });

  it('GET on the seeded PR returns the seeded record, not stale, with no model call', async () => {
    const { app, llm, github } = await appWith();

    const res = await app.inject({ method: 'GET', url: `/pulls/${seededPrId}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json().intent).toMatchObject({
      pr_id: seededPrId,
      summary: SEEDED_SUMMARY,
      in_scope: [
        'Token-bucket rate limiter middleware',
        'Return 429 with Retry-After header',
        'Apply the limiter to the public webhook routes',
      ],
      out_of_scope: ['Per-plan or per-user limits', 'Changes to authentication', 'An admin dashboard for limits'],
      risk_areas: [
        { kind: 'security', label: 'Auth surface touched' },
        { kind: 'api', label: 'Public webhook behaviour changes' },
        { kind: 'performance', label: 'Runs on every public request' },
      ],
      confidence: 'medium',
      sources: [
        { kind: 'title', ref: null, status: 'used', reason: null },
        { kind: 'description', ref: null, status: 'used', reason: null },
        { kind: 'changed_files', ref: null, status: 'used', reason: null },
      ],
      missing_context: false,
      injection_suspected: false,
      stale: false,
      model: 'seed',
      cost_usd: null,
    });
    expect(llm.calls).toEqual([]);
    expect(github.issueRequests).toEqual([]);
  });

  it('POST computes, persists and returns the record with its summary; a following GET returns the same', async () => {
    const { app, llm, github } = await appWith({ github: { issues: { 471: { number: 471, title: 'Rate limit', body: 'b', state: 'open' } } } });
    const pr = await newPr();

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(post.statusCode).toBe(200);
    const record = post.json().intent;
    expect(record).toMatchObject({
      pr_id: pr.id,
      summary: CLASSIFICATION.summary,
      in_scope: CLASSIFICATION.in_scope,
      out_of_scope: CLASSIFICATION.out_of_scope,
      risk_areas: CLASSIFICATION.risk_areas,
      confidence: 'high',
      missing_context: false,
      injection_suspected: false,
      stale: false,
      model: DEFAULT_MODEL,
      cost_usd: 0.001,
    });
    expect(record.sources).toContainEqual({ kind: 'linked_issue', ref: '#471', status: 'used', reason: null });
    expect(github.issueRequests).toEqual([471]);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    // Persisted: the summary lives in the `intent` column, and the hash is stored for staleness.
    const [row] = await rowsFor(pr.id);
    expect(row).toMatchObject({ intent: CLASSIFICATION.summary, model: DEFAULT_MODEL, tokensIn: 100, tokensOut: 50 });
    expect(row!.sourceHash).toEqual(expect.any(String));

    const get = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(get.statusCode).toBe(200);
    expect(get.json().intent).toEqual(record);
  });

  it('classifies with the Settings override after PUT /settings, not any agent model (R5)', async () => {
    const { app, llm } = await appWith();
    const pr = await newPr();

    try {
      const put = await app.inject({
        method: 'PUT',
        url: '/settings',
        payload: { feature_models: { review_intent: { provider: 'openrouter', model: OVERRIDE_MODEL } } },
      });
      expect(put.statusCode).toBe(200);

      const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
      expect(post.statusCode).toBe(200);
      expect(post.json().intent.model).toBe(OVERRIDE_MODEL);

      const [call] = llm.calls.filter((c) => c.method === 'completeStructured');
      const sentModel = (call!.req as { model: string }).model;
      expect(sentModel).toBe(OVERRIDE_MODEL);
      const agentModels = (await pg.handle.db.select({ model: t.agents.model }).from(t.agents)).map((a) => a.model);
      expect(agentModels.length).toBeGreaterThan(0);
      expect(agentModels).not.toContain(sentModel);
    } finally {
      // Settings are shared by every test in this file: put the default back.
      await pg.handle.db
        .delete(t.settings)
        .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
    }
  });

  it('stale becomes true after the PR body changes and false again after another POST (R2)', async () => {
    const { app } = await appWith();
    const pr = await newPr();
    const url = `/pulls/${pr.id}/intent`;

    await app.inject({ method: 'POST', url });
    expect((await app.inject({ method: 'GET', url })).json().intent.stale).toBe(false);

    await pg.handle.db
      .update(t.pullRequests)
      .set({ body: 'Add rate limiting. Closes #471. Now with metrics.' })
      .where(eq(t.pullRequests.id, pr.id));
    expect((await app.inject({ method: 'GET', url })).json().intent.stale).toBe(true);

    const post = await app.inject({ method: 'POST', url });
    expect(post.json().intent.stale).toBe(false);
    expect((await app.inject({ method: 'GET', url })).json().intent.stale).toBe(false);
  });

  it('answers 404 for an unknown pull request id on both routes', async () => {
    const { app } = await appWith();

    const get = await app.inject({ method: 'GET', url: `/pulls/${UNKNOWN_ID}/intent` });
    expect(get.statusCode).toBe(404);
    expect(get.json().error.code).toBe('not_found');

    const post = await app.inject({ method: 'POST', url: `/pulls/${UNKNOWN_ID}/intent` });
    expect(post.statusCode).toBe(404);
    expect(post.json().error.code).toBe('not_found');
  });

  it('POST answers 400 intent_unavailable when the provider has no key, and stores nothing', async () => {
    const { app, github } = await appWith({ noKey: true });
    const pr = await newPr();

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('intent_unavailable');
    expect(github.issueRequests).toEqual([]);
    expect(await rowsFor(pr.id)).toHaveLength(0);
  });

  it('POST answers 502 external_service_error when the model output fails its schema', async () => {
    const { app } = await appWith({ fixture: { summary: 42 } });
    const pr = await newPr();

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('external_service_error');
    expect(await rowsFor(pr.id)).toHaveLength(0);
  });

  it('two seed() calls leave one intent row for the seeded PR, unchanged', async () => {
    await seed(pg.handle.db);
    await seed(pg.handle.db);

    const rows = await rowsFor(seededPrId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.intent).toBe(SEEDED_SUMMARY);
  });

  describe('a stored row that no longer matches the contract (phase 10)', () => {
    it.each([
      ['sources', { sources: [{ kind: 'bogus' }] as unknown as IntentSource[] }],
      ['confidence', { confidence: 'sky-high' as 'high' }],
    ])('a bad %s reads as { intent: null }, is replaced by the next POST and then reads normally', async (_column, bad) => {
      const { app, llm } = await appWith();
      const pr = await newPr();
      const url = `/pulls/${pr.id}/intent`;

      const first = await app.inject({ method: 'POST', url });
      expect(first.statusCode).toBe(200);
      await pg.handle.db.update(t.prIntent).set(bad).where(eq(t.prIntent.prId, pr.id));
      const callsBefore = llm.calls.length;

      const unreadable = await app.inject({ method: 'GET', url });
      expect(unreadable.statusCode).toBe(200);
      expect(unreadable.json()).toEqual({ intent: null });
      expect(llm.calls).toHaveLength(callsBefore);

      const post = await app.inject({ method: 'POST', url });
      expect(post.statusCode).toBe(200);
      const record = post.json().intent;
      expect(record).toMatchObject({ pr_id: pr.id, summary: CLASSIFICATION.summary });

      const get = await app.inject({ method: 'GET', url });
      expect(get.statusCode).toBe(200);
      expect(get.json().intent).toEqual(record);
    });
  });
});
