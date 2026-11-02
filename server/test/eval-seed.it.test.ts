/**
 * The seeded L06 eval fixture of "Security Reviewer" (`seedEvalFixture` via `seed()`) against a real
 * Postgres. Spec: `server/specs/eval-pipeline.md` ("Seeded eval data", R-SRV-43); plan:
 * `specs/plans/eval-pipeline.md`, phase 7. The stored rows are read straight from the tables; the
 * per-case results and the dashboard numbers are read through `app.inject` on the built app, with an
 * empty `MockSecretsProvider` (so `~/.devdigest/secrets.json` is never read) and `MockGitHubClient`:
 * no key, no network.
 * Not covered here: the overview query on arbitrary data (`eval-pipeline.it.test.ts`); the strings
 * the dashboard renders (the e2e fixtures in `e2e/specs/seed-fixtures.md`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import type { EvalOverview, EvalSuiteRunDetail } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed, DEFAULT_WORKSPACE_NAME } from '../src/db/seed.js';
import { seedEvalFixture } from '../src/db/seed-eval.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const SUFFIX = '\n\nFlag every database query inside a loop as a performance problem.';
const MINUTE = 60_000;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

type App = Awaited<ReturnType<typeof buildApp>>;

d('L06 seeded eval fixture (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let agent: typeof t.agents.$inferSelect;
  const apps: App[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
    workspaceId = ws!.id;
    const [a] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
    agent = a!;
  });

  afterAll(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
    await pg?.stop();
  });

  async function appWith() {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        git: new MockGitClient({ diff: '' }),
      },
    });
    apps.push(app);
    return app;
  }

  const casesOf = (agentId: string) =>
    pg.handle.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.ownerId, agentId), eq(t.evalCases.ownerKind, 'agent')))
      .orderBy(asc(t.evalCases.name));
  const runsOf = (agentId: string) =>
    pg.handle.db
      .select()
      .from(t.evalSuiteRuns)
      .where(eq(t.evalSuiteRuns.agentId, agentId))
      .orderBy(asc(t.evalSuiteRuns.startedAt));
  const resultCount = async () => (await pg.handle.db.select().from(t.evalRuns)).length;

  it('two more seed() calls leave exactly two cases, two runs and four results for Security Reviewer, and nothing for the other agents', async () => {
    await seed(pg.handle.db);
    await seed(pg.handle.db);

    expect((await casesOf(agent.id)).map((c) => c.name)).toEqual(['must-find-stripe-key', 'no-n-plus-one-user-list']);
    expect(await runsOf(agent.id)).toHaveLength(2);
    expect(await resultCount()).toBe(4);
    const all = await pg.handle.db.select().from(t.evalSuiteRuns);
    expect(all).toHaveLength(2);
    expect(await pg.handle.db.select().from(t.evalCases)).toHaveLength(2);
  });

  it('stores the two runs with the spec values: prompts, metrics, passed / total, costs, finished_at, the agent snapshot and no skills', async () => {
    const [older, newer] = await runsOf(agent.id);

    expect(older).toMatchObject({
      workspaceId,
      status: 'done',
      systemPrompt: agent.systemPrompt + SUFFIX,
      recall: 1,
      precision: 0.5,
      citationAccuracy: 0.6667,
      casesTotal: 2,
      casesDone: 2,
      casesPassed: 1,
      casesErrored: 0,
      costUsd: 0.004,
      error: null,
    });
    expect(newer).toMatchObject({
      workspaceId,
      status: 'done',
      systemPrompt: agent.systemPrompt,
      recall: 1,
      precision: 1,
      citationAccuracy: 1,
      casesTotal: 2,
      casesDone: 2,
      casesPassed: 2,
      casesErrored: 0,
      costUsd: 0.003,
      error: null,
    });
    expect(older!.startedAt.toISOString()).toBe('2026-10-30T10:00:00.000Z');
    expect(newer!.startedAt.toISOString()).toBe('2026-10-31T10:00:00.000Z');
    for (const run of [older!, newer!]) {
      expect(run.finishedAt!.getTime() - run.startedAt.getTime()).toBe(MINUTE);
      expect(run).toMatchObject({
        agentVersion: agent.version,
        provider: agent.provider,
        model: agent.model,
        strategy: agent.strategy,
        skills: [],
      });
    }
  });

  it('stores the two cases with their expectations, PR #482 meta, the seeded patch under a diff header and no source finding', async () => {
    const [stripe, nPlusOne] = await casesOf(agent.id);
    expect(stripe!.name).toBe('must-find-stripe-key');
    expect(nPlusOne!.name).toBe('no-n-plus-one-user-list');

    expect(stripe!.expectedOutput).toEqual({
      kind: 'must_find',
      file: 'src/config.ts',
      start_line: 12,
      end_line: 12,
      title: 'Hardcoded Stripe secret key in commit',
      severity: 'CRITICAL',
      category: 'security',
    });
    expect(nPlusOne!.expectedOutput).toEqual({
      kind: 'must_not_flag',
      file: 'src/api/users.ts',
      start_line: 45,
      end_line: 52,
      title: 'N+1 query in user list endpoint',
      severity: 'WARNING',
      category: 'perf',
    });

    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    for (const c of [stripe!, nPlusOne!]) {
      expect(c.sourceFindingId).toBeNull();
      expect(c.workspaceId).toBe(workspaceId);
      expect(c.inputMeta).toEqual({
        pr_id: pr!.id,
        pr_number: 482,
        repo: 'acme/payments-api',
        pr_title: 'Add rate limiting to public API endpoints',
        pr_body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
        pr_author: 'marisa.koch',
        head_sha: 'a1b2c3d4e5f6',
      });
      const file = (c.expectedOutput as { file: string }).file;
      const [stored] = await pg.handle.db
        .select({ patch: t.prFiles.patch })
        .from(t.prFiles)
        .where(and(eq(t.prFiles.prId, pr!.id), eq(t.prFiles.path, file)));
      expect(c.inputFiles).toEqual([file]);
      // The fragment is the three normalised header lines, then the seeded patch of that file.
      expect(c.inputDiff).toBe(
        [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, stored!.patch].join('\n'),
      );
    }
    expect(stripe!.inputDiff).toContain('sk_live_');
  });

  it('serves the per-case results of each run through GET /eval-runs/:id, as the spec lists them', async () => {
    const app = await appWith();
    const [older, newer] = await runsOf(agent.id);

    const detail = async (id: string) => {
      const res = await app.inject({ method: 'GET', url: `/eval-runs/${id}` });
      expect(res.statusCode).toBe(200);
      return res.json() as EvalSuiteRunDetail;
    };
    const o = await detail(older!.id);
    const n = await detail(newer!.id);

    // older: Stripe pass with one matching finding and dropped 1; N+1 fail with one matching finding.
    expect(o.results.map((r) => [r.case_name, r.outcome])).toEqual([
      ['must-find-stripe-key', 'pass'],
      ['no-n-plus-one-user-list', 'fail'],
    ]);
    expect(o.results[0]!.actual_output!.dropped).toBe(1);
    expect(o.results[0]!.actual_output!.findings.map((f) => f.matches)).toEqual([true]);
    expect(o.results[1]!.actual_output!.dropped).toBe(0);
    expect(o.results[1]!.actual_output!.findings.map((f) => f.matches)).toEqual([true]);
    // newer: both pass, one matching finding on the Stripe case, none on the N+1 case, dropped 0.
    expect(n.results.map((r) => [r.case_name, r.outcome])).toEqual([
      ['must-find-stripe-key', 'pass'],
      ['no-n-plus-one-user-list', 'pass'],
    ]);
    expect(n.results[0]!.actual_output!.findings.map((f) => f.matches)).toEqual([true]);
    expect(n.results[1]!.actual_output!.findings).toEqual([]);
    expect([n.results[0]!.actual_output!.dropped, n.results[1]!.actual_output!.dropped]).toEqual([0, 0]);
    for (const r of [...o.results, ...n.results]) expect(r.error).toBeNull();
    expect(o.results.every((r) => r.suite_run_id === older!.id)).toBe(true);
    expect(n.results.every((r) => r.suite_run_id === newer!.id)).toBe(true);
    expect(o.config.system_prompt).toBe(agent.systemPrompt + SUFFIX);
    expect(n.config.skills).toEqual([]);
  });

  it('shows in GET /evals/overview that only Security Reviewer has cases and runs, with latest the 2026-10-31 run', async () => {
    const app = await appWith();

    const res = await app.inject({ method: 'GET', url: '/evals/overview' });

    expect(res.statusCode).toBe(200);
    const body = res.json() as EvalOverview;
    const security = body.agents.find((a) => a.agent_name === 'Security Reviewer')!;
    expect(security).toMatchObject({ cases_total: 2, runs_total: 2, running: false, recall_trend: [1, 1] });
    expect(security.latest).toMatchObject({
      started_at: '2026-10-31T10:00:00.000Z',
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
    });
    const others = body.agents.filter((a) => a.agent_name !== 'Security Reviewer');
    expect(others.length).toBeGreaterThan(0);
    for (const a of others) {
      expect(a).toMatchObject({ cases_total: 0, runs_total: 0, latest: null, recall_trend: [] });
    }
    expect(body.recent_runs.map((r) => r.started_at)).toEqual([
      '2026-10-31T10:00:00.000Z',
      '2026-10-30T10:00:00.000Z',
    ]);
  });

  it('a seed() after an edit to a run and a case leaves the edit in place and inserts nothing (R-SRV-43)', async () => {
    const [, newer] = await runsOf(agent.id);
    const [stripe] = await casesOf(agent.id);
    const editedTitle = { ...(stripe!.expectedOutput as object), title: 'Edited by the test' };
    try {
      await pg.handle.db.update(t.evalSuiteRuns).set({ recall: 0.25 }).where(eq(t.evalSuiteRuns.id, newer!.id));
      await pg.handle.db.update(t.evalCases).set({ expectedOutput: editedTitle }).where(eq(t.evalCases.id, stripe!.id));

      await seed(pg.handle.db);

      const after = await runsOf(agent.id);
      expect(after).toHaveLength(2);
      expect(after.find((r) => r.id === newer!.id)!.recall).toBe(0.25);
      const cases = await casesOf(agent.id);
      expect(cases).toHaveLength(2);
      expect(cases.find((c) => c.id === stripe!.id)!.expectedOutput).toMatchObject({ title: 'Edited by the test' });
      expect(await resultCount()).toBe(4);
    } finally {
      await pg.handle.db.update(t.evalSuiteRuns).set({ recall: newer!.recall }).where(eq(t.evalSuiteRuns.id, newer!.id));
      await pg.handle.db
        .update(t.evalCases)
        .set({ expectedOutput: stripe!.expectedOutput })
        .where(eq(t.evalCases.id, stripe!.id));
    }
  });

  it('seeds nothing in a workspace that has no Security Reviewer', async () => {
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: 'no-security-reviewer' }).returning();
    const before = [await resultCount(), (await pg.handle.db.select().from(t.evalCases)).length];

    await seedEvalFixture(pg.handle.db, {
      workspaceId: ws!.id,
      prId: UNKNOWN_ID,
      patches: { 'src/config.ts': '@@ -1 +1 @@' },
    });

    expect([await resultCount(), (await pg.handle.db.select().from(t.evalCases)).length]).toEqual(before);
    expect(await pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.workspaceId, ws!.id))).toEqual([]);
  });
});
