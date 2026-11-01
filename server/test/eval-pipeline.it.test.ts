/**
 * L06 eval module, case routes, against a real Postgres, the built app and `app.inject`:
 *   POST   /findings/:id/eval-case
 *   GET    /agents/:id/eval-cases
 *   DELETE /eval-cases/:id
 *   DELETE /agents/:id (removes the agent's cases, runs and results)
 * The outside world is replaced through `overrides` (an empty `MockSecretsProvider`, so
 * `~/.devdigest/secrets.json` is never read, `MockGitHubClient` and `MockGitClient`): no key, no network.
 * Each test inserts its own agent, repo, PR, review and findings, so counts never depend on the seed.
 *   POST /agents/:id/eval-runs · GET /agents/:id/eval-runs · GET /eval-runs/:id (phase 6, last describe)
 * The run routes use a `ScriptedLLMProvider` as the agent's model, so the real `reviewPullRequest` runs
 * with no network: a gate promise holds the model call while a test acts mid-run.
 * Spec: `server/specs/eval-pipeline.md` (R-SRV-1–R-SRV-14, R-SRV-15–R-SRV-18, R-SRV-25–R-SRV-35,
 * R-SRV-37–R-SRV-40, R-SRV-48); plan: `specs/plans/eval-pipeline.md`, phases 4–6.
 * Not covered here: the 1,500-line cut (`eval-domain.test.ts`), the 3-in-flight cap (`eval-executor.test.ts`),
 * the 429 on the 11th POST (`eval-rate-limit.test.ts`).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type {
  EvalCaseCreateResponse,
  EvalCaseList,
  EvalOverview,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalSuiteRunList,
  LLMProvider,
  Review,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForEvalRun } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { EvalRepository } from '../src/modules/eval/repository.js';
import { loadConfig } from '../src/platform/config.js';
import { seed, DEFAULT_WORKSPACE_NAME } from '../src/db/seed.js';
import {
  MockAuthProvider,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
  ScriptedLLMProvider,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const FILE = 'src/a.ts';
const HEAD = 'c0ffee000001';

/** The stored `pr_files` patch: two hunks. */
const PATCH = [
  '@@ -1,3 +1,4 @@',
  ' line one',
  '+added two',
  ' line three',
  ' line four',
  '@@ -20,2 +21,3 @@',
  ' ctx',
  '+added late',
  ' end',
].join('\n');

/** What the clone's `git diff` returns: other text, so the source of the fragment is visible. */
const CLONE_DIFF = [
  `diff --git a/${FILE} b/${FILE}`,
  'index 1234567..89abcde 100644',
  `--- a/${FILE}`,
  `+++ b/${FILE}`,
  '@@ -5,2 +5,3 @@',
  ' clone ctx',
  '+FROM-CLONE',
  ' clone end',
].join('\n');

const post = (app: App, findingId: string) =>
  app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
const list = (app: App, agentId: string) =>
  app.inject({ method: 'GET', url: `/agents/${agentId}/eval-cases` });

type App = Awaited<ReturnType<typeof buildApp>>;

d('L06 eval case routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  const apps: App[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
    workspaceId = ws!.id;
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  afterAll(async () => {
    await pg?.stop();
  });

  async function appWith(git: MockGitClient = new MockGitClient({ diff: '' }), llm?: LLMProvider) {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        git,
        ...(llm ? { llm: { openai: llm } } : {}),
      },
    });
    apps.push(app);
    return app;
  }

  /** An agent plus a PR with the given stored patches and a review of that agent. */
  async function scenario(
    o: {
      ws?: string;
      patches?: { path: string; patch: string | null }[];
      body?: string | null;
      reviewAgent?: 'agent' | 'none' | 'deleted';
    } = {},
  ) {
    const db = pg.handle.db;
    const ws = o.ws ?? workspaceId;
    const n = seq++;
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId: ws, name: `eval-agent-${n}`, provider: 'openai', model: 'gpt-4o', systemPrompt: 'Review.' })
      .returning();
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: `eval-${n}`, fullName: `acme/eval-${n}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 900 + n,
        title: 'Harden config loading',
        author: 'marisa.koch',
        branch: 'feat/x',
        base: 'main',
        headSha: HEAD,
        status: 'needs_review',
        body: o.body === undefined ? 'Loads the config safely.' : o.body,
      })
      .returning();
    const patches = o.patches ?? [{ path: FILE, patch: PATCH }];
    if (patches.length > 0) {
      await db.insert(t.prFiles).values(patches.map((p) => ({ prId: pr!.id, ...p })));
    }
    const kind = o.reviewAgent ?? 'agent';
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId: ws,
        prId: pr!.id,
        agentId: kind === 'none' ? null : kind === 'deleted' ? UNKNOWN_ID : agent!.id,
        kind: 'review',
      })
      .returning();

    let findingSeq = 0;
    async function finding(
      state: 'accepted' | 'dismissed' | 'open',
      f: { file?: string; start?: number; end?: number; title?: string } = {},
    ) {
      const at = new Date();
      const [row] = await db
        .insert(t.findings)
        .values({
          reviewId: review!.id,
          file: f.file ?? FILE,
          startLine: f.start ?? 2,
          endLine: f.end ?? 2,
          severity: 'WARNING',
          category: 'bug',
          title: f.title ?? `Finding ${n}-${findingSeq++}`,
          rationale: 'r',
          confidence: 0.9,
          acceptedAt: state === 'accepted' ? at : null,
          dismissedAt: state === 'dismissed' ? at : null,
        })
        .returning();
      return row!;
    }
    return { agent: agent!, repo: repo!, pr: pr!, review: review!, finding };
  }

  const casesOf = (agentId: string) =>
    pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.ownerId, agentId));
  const caseRows = (findingId: string) =>
    pg.handle.db.select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, findingId));

  describe('POST /findings/:id/eval-case', () => {
    it('answers 201 for an accepted finding with a must_find case, the stored fragment and the PR meta (R-SRV-1, R-SRV-3, R-SRV-5)', async () => {
      const app = await appWith();
      const s = await scenario();
      const f = await s.finding('accepted', { title: 'Missing null check' });

      const res = await post(app, f.id);

      expect(res.statusCode).toBe(201);
      const body = res.json() as EvalCaseCreateResponse;
      expect(body.created).toBe(true);
      expect(body.case.owner_kind).toBe('agent');
      expect(body.case.owner_id).toBe(s.agent.id);
      expect(body.case.source_finding_id).toBe(f.id);
      expect(body.case.expected_output).toEqual({
        kind: 'must_find',
        file: FILE,
        start_line: 2,
        end_line: 2,
        title: 'Missing null check',
        severity: 'WARNING',
        category: 'bug',
      });
      expect(body.case.input_files).toEqual([FILE]);
      // Both hunks keep their original headers; only the three header lines precede them.
      expect(body.case.input_diff).toBe(
        [`diff --git a/${FILE} b/${FILE}`, `--- a/${FILE}`, `+++ b/${FILE}`, PATCH].join('\n'),
      );
      expect(body.case.input_meta).toEqual({
        pr_id: s.pr.id,
        pr_number: s.pr.number,
        repo: `acme/${s.repo.name}`,
        pr_title: 'Harden config loading',
        pr_body: 'Loads the config safely.',
        pr_author: 'marisa.koch',
        head_sha: HEAD,
      });
      expect(await caseRows(f.id)).toHaveLength(1);
    });

    it('stores a must_not_flag case for a dismissed finding (R-SRV-2)', async () => {
      const app = await appWith();
      const s = await scenario();
      const f = await s.finding('dismissed', { title: 'Style nit' });

      const res = await post(app, f.id);

      expect(res.statusCode).toBe(201);
      const body = res.json() as EvalCaseCreateResponse;
      expect(body.created).toBe(true);
      expect(body.case.expected_output.kind).toBe('must_not_flag');
      expect(body.case.owner_id).toBe(s.agent.id);
      expect(body.case.name).toBe('no-style-nit');
    });

    it('stores a null pr_body when the description is empty (R-SRV-5)', async () => {
      const app = await appWith();
      const s = await scenario({ body: '' });
      const f = await s.finding('accepted');

      const res = await post(app, f.id);

      expect(res.statusCode).toBe(201);
      expect((res.json() as EvalCaseCreateResponse).case.input_meta).toMatchObject({ pr_body: null });
    });

    it('takes the fragment from the clone diff when the clone returns files, and drops git index lines (R-SRV-3)', async () => {
      const app = await appWith(new MockGitClient({ diff: CLONE_DIFF }));
      const s = await scenario();
      const f = await s.finding('accepted', { start: 6, end: 6 });

      const res = await post(app, f.id);

      expect(res.statusCode).toBe(201);
      const diff = (res.json() as EvalCaseCreateResponse).case.input_diff;
      expect(diff).toBe(
        [
          `diff --git a/${FILE} b/${FILE}`,
          `--- a/${FILE}`,
          `+++ b/${FILE}`,
          '@@ -5,2 +5,3 @@',
          ' clone ctx',
          '+FROM-CLONE',
          ' clone end',
        ].join('\n'),
      );
      expect(diff).not.toContain('added two');
      expect(diff).not.toContain('index 1234567');
    });

    it('falls back to the stored pr_files patches when the clone diff has no files (R-SRV-3)', async () => {
      const app = await appWith(new MockGitClient({ diff: '' }));
      const s = await scenario();
      const f = await s.finding('accepted');

      const res = await post(app, f.id);

      expect(res.statusCode).toBe(201);
      const diff = (res.json() as EvalCaseCreateResponse).case.input_diff;
      expect(diff).toContain('+added two');
      expect(diff).not.toContain('FROM-CLONE');
    });

    it('answers 422 and writes nothing for an open finding (R-SRV-6)', async () => {
      const app = await appWith();
      const s = await scenario();
      const f = await s.finding('open');

      const res = await post(app, f.id);

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toMatchObject({
        code: 'validation_error',
        message: 'Accept or dismiss the finding first',
      });
      expect(await casesOf(s.agent.id)).toHaveLength(0);
    });

    it('answers 422 and writes nothing for a review with no agent (R-SRV-7)', async () => {
      const app = await appWith();
      const s = await scenario({ reviewAgent: 'none' });
      const f = await s.finding('accepted');

      const res = await post(app, f.id);

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toMatchObject({ code: 'validation_error', message: 'No agent for this finding' });
      expect(await caseRows(f.id)).toHaveLength(0);
    });

    it('answers 422 and writes nothing when the review\'s agent no longer exists (R-SRV-7)', async () => {
      const app = await appWith();
      const s = await scenario({ reviewAgent: 'deleted' });
      const f = await s.finding('dismissed');

      const res = await post(app, f.id);

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toMatchObject({ code: 'validation_error', message: 'No agent for this finding' });
      expect(await caseRows(f.id)).toHaveLength(0);
    });

    it('answers 422 and writes nothing when the diff has no hunk for the finding\'s file (R-SRV-8)', async () => {
      const app = await appWith();
      // The PR stores a patch for another file only; the finding is in a file the diff does not touch.
      const s = await scenario({ patches: [{ path: 'src/other.ts', patch: PATCH }] });
      const f = await s.finding('accepted', { file: 'src/missing.ts' });

      const res = await post(app, f.id);

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toMatchObject({
        code: 'validation_error',
        message: 'No diff available for src/missing.ts',
      });
      expect(await caseRows(f.id)).toHaveLength(0);
    });

    it('answers 422 when the file\'s stored patch is null, so it has no hunk (R-SRV-8)', async () => {
      const app = await appWith();
      const s = await scenario({ patches: [{ path: FILE, patch: null }] });
      const f = await s.finding('accepted');

      const res = await post(app, f.id);

      expect(res.statusCode).toBe(422);
      expect(res.json().error.message).toBe(`No diff available for ${FILE}`);
      expect(await caseRows(f.id)).toHaveLength(0);
    });

    it('answers 200 with created:false and the same case on a repeat, and writes no second row (R-SRV-9)', async () => {
      const app = await appWith();
      const s = await scenario();
      const f = await s.finding('accepted');

      const first = await post(app, f.id);
      const second = await post(app, f.id);

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(200);
      const a = first.json() as EvalCaseCreateResponse;
      const b = second.json() as EvalCaseCreateResponse;
      expect(b.created).toBe(false);
      expect(b.case).toEqual(a.case);
      expect(await caseRows(f.id)).toHaveLength(1);
    });

    it('leaves the stored case unchanged when the finding is later accepted after a dismissal (R-SRV-10)', async () => {
      const app = await appWith();
      const s = await scenario();
      const f = await s.finding('dismissed');
      const created = (await post(app, f.id)).json() as EvalCaseCreateResponse;
      expect(created.case.expected_output.kind).toBe('must_not_flag');

      const accept = await app.inject({ method: 'POST', url: `/findings/${f.id}/accept` });
      expect(accept.statusCode).toBe(200);
      const repeat = await post(app, f.id);

      expect(repeat.statusCode).toBe(200);
      expect((repeat.json() as EvalCaseCreateResponse).case).toEqual(created.case);
      const [row] = await caseRows(f.id);
      expect(row!.expectedOutput).toMatchObject({ kind: 'must_not_flag' });
      expect(row!.inputDiff).toBe(created.case.input_diff);
    });

    it('stores one case when two requests for one finding race (R-SRV-11)', async () => {
      const app = await appWith();
      const s = await scenario();
      const f = await s.finding('accepted');

      const [r1, r2] = await Promise.all([post(app, f.id), post(app, f.id)]);

      expect([r1.statusCode, r2.statusCode].sort()).toEqual([200, 201]);
      const b1 = r1.json() as EvalCaseCreateResponse;
      const b2 = r2.json() as EvalCaseCreateResponse;
      expect(b1.case.id).toBe(b2.case.id);
      expect([b1.created, b2.created].sort()).toEqual([false, true]);
      expect(await caseRows(f.id)).toHaveLength(1);
    });
  });

  describe('GET /agents/:id/eval-cases', () => {
    it('returns all 8 cases of the agent, newest first, and no case of another agent (R-SRV-13)', async () => {
      const app = await appWith();
      const s = await scenario();
      const other = await scenario();
      const ids: string[] = [];
      for (let i = 0; i < 8; i++) {
        const f = await s.finding(i % 2 === 0 ? 'accepted' : 'dismissed');
        const res = await post(app, f.id);
        expect(res.statusCode).toBe(201);
        ids.push((res.json() as EvalCaseCreateResponse).case.id);
      }
      const foreign = await post(app, (await other.finding('accepted')).id);
      expect(foreign.statusCode).toBe(201);

      const res = await list(app, s.agent.id);

      expect(res.statusCode).toBe(200);
      const body = res.json() as EvalCaseList;
      expect(body.cases).toHaveLength(8);
      expect(body.cases.map((c) => c.id)).toEqual([...ids].reverse());
      expect(body.cases.every((c) => c.owner_id === s.agent.id)).toBe(true);
    });

    it('returns an empty list for an agent with no case', async () => {
      const app = await appWith();
      const s = await scenario();

      const res = await list(app, s.agent.id);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ cases: [] });
    });
  });

  describe('DELETE /eval-cases/:id', () => {
    it('answers 204, removes the case and its eval_runs rows, and leaves the suite run unchanged (R-SRV-14)', async () => {
      const db = pg.handle.db;
      const app = await appWith();
      const s = await scenario();
      const keep = await post(app, (await s.finding('accepted')).id);
      const doomed = await post(app, (await s.finding('dismissed')).id);
      const keepId = (keep.json() as EvalCaseCreateResponse).case.id;
      const doomedId = (doomed.json() as EvalCaseCreateResponse).case.id;

      const [suite] = await db
        .insert(t.evalSuiteRuns)
        .values({
          workspaceId,
          agentId: s.agent.id,
          agentVersion: 1,
          systemPrompt: 'Review.',
          provider: 'openai',
          model: 'gpt-4o',
          strategy: 'single-pass',
          skills: [],
          status: 'done',
          recall: 0.5,
          precision: 0.25,
          citationAccuracy: 1,
          casesTotal: 2,
          casesDone: 2,
          casesPassed: 1,
          casesErrored: 0,
          costUsd: 0.0123,
          finishedAt: new Date(),
        })
        .returning();
      await db.insert(t.evalRuns).values([
        { caseId: doomedId, suiteRunId: suite!.id, pass: true, recall: 1 },
        { caseId: keepId, suiteRunId: suite!.id, pass: false, recall: 0 },
      ]);

      const res = await app.inject({ method: 'DELETE', url: `/eval-cases/${doomedId}` });

      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
      expect(await db.select().from(t.evalCases).where(eq(t.evalCases.id, doomedId))).toHaveLength(0);
      expect(await db.select().from(t.evalCases).where(eq(t.evalCases.id, keepId))).toHaveLength(1);
      expect(await db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, doomedId))).toHaveLength(0);
      expect(await db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, keepId))).toHaveLength(1);
      const [after] = await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, suite!.id));
      expect(after).toEqual(suite);
    });

    it('answers 404 for an unknown case', async () => {
      const app = await appWith();

      const res = await app.inject({ method: 'DELETE', url: `/eval-cases/${UNKNOWN_ID}` });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    });
  });

  describe('workspace scoping (R-SRV-37)', () => {
    it('answers 404 for another workspace\'s finding, agent and case, and deletes nothing', async () => {
      const db = pg.handle.db;
      const app = await appWith();
      const [other] = await db.insert(t.workspaces).values({ name: `other-ws-${seq++}` }).returning();
      const s = await scenario({ ws: other!.id });
      const f = await s.finding('accepted');
      const [foreignCase] = await db
        .insert(t.evalCases)
        .values({
          workspaceId: other!.id,
          ownerKind: 'agent',
          ownerId: s.agent.id,
          name: 'must-find-foreign',
          inputDiff: 'diff',
          inputFiles: [FILE],
          inputMeta: {
            pr_id: s.pr.id,
            pr_number: s.pr.number,
            repo: 'acme/x',
            pr_title: 't',
            pr_body: null,
            pr_author: 'a',
            head_sha: HEAD,
          },
          expectedOutput: {
            kind: 'must_find',
            file: FILE,
            start_line: 2,
            end_line: 2,
            title: 't',
            severity: 'WARNING',
            category: 'bug',
          },
        })
        .returning();

      const create = await post(app, f.id);
      const listing = await list(app, s.agent.id);
      const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${foreignCase!.id}` });

      for (const res of [create, listing, del]) {
        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe('not_found');
      }
      expect(
        await db
          .select()
          .from(t.evalCases)
          .where(and(eq(t.evalCases.id, foreignCase!.id), eq(t.evalCases.workspaceId, other!.id))),
      ).toHaveLength(1);
      expect(await caseRows(f.id)).toHaveLength(0);
    });

    it('answers 404 for an unknown finding and an unknown agent', async () => {
      const app = await appWith();

      const create = await post(app, UNKNOWN_ID);
      const listing = await list(app, UNKNOWN_ID);

      expect(create.statusCode).toBe(404);
      expect(listing.statusCode).toBe(404);
    });
  });

  describe('DELETE /agents/:id (R-SRV-35)', () => {
    /** An eval case inserted directly, owned by `agentId`, plus one suite run with one result row on it. */
    async function seedEvalRows(s: Awaited<ReturnType<typeof scenario>>, ws: string = workspaceId, caseCount = 2) {
      const db = pg.handle.db;
      const cases = await db
        .insert(t.evalCases)
        .values(
          Array.from({ length: caseCount }, (_, i) => ({
            workspaceId: ws,
            ownerKind: 'agent' as const,
            ownerId: s.agent.id,
            name: `must-find-case-${i}`,
            inputDiff: 'diff',
            inputFiles: [FILE],
            inputMeta: {
              pr_id: s.pr.id,
              pr_number: s.pr.number,
              repo: 'acme/x',
              pr_title: 't',
              pr_body: null,
              pr_author: 'a',
              head_sha: HEAD,
            },
            expectedOutput: {
              kind: 'must_find' as const,
              file: FILE,
              start_line: 2,
              end_line: 2,
              title: `t${i}`,
              severity: 'WARNING' as const,
              category: 'bug' as const,
            },
          })),
        )
        .returning();
      const [suite] = await db
        .insert(t.evalSuiteRuns)
        .values({
          workspaceId: ws,
          agentId: s.agent.id,
          agentVersion: 1,
          systemPrompt: 'Review.',
          provider: 'openai',
          model: 'gpt-4o',
          strategy: 'single-pass',
          skills: [],
          status: 'done',
          recall: 1,
          precision: 1,
          citationAccuracy: 1,
          casesTotal: caseCount,
          casesDone: caseCount,
          casesPassed: caseCount,
          casesErrored: 0,
          finishedAt: new Date(),
        })
        .returning();
      const results = await db
        .insert(t.evalRuns)
        .values({ caseId: cases[0]!.id, suiteRunId: suite!.id, pass: true, recall: 1 })
        .returning();
      return { cases, suite: suite!, results };
    }

    const evalRowCounts = async (rows: Awaited<ReturnType<typeof seedEvalRows>>) => {
      const db = pg.handle.db;
      return {
        cases: (await db.select().from(t.evalCases).where(eq(t.evalCases.id, rows.cases[0]!.id))).length +
          (await db.select().from(t.evalCases).where(eq(t.evalCases.id, rows.cases[1]!.id))).length,
        suiteRuns: (await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, rows.suite.id))).length,
        results: (await db.select().from(t.evalRuns).where(eq(t.evalRuns.id, rows.results[0]!.id))).length,
      };
    };

    it('answers 200 and removes the agent\'s cases, suite runs and results, and leaves another agent\'s untouched', async () => {
      const db = pg.handle.db;
      const app = await appWith();
      const doomed = await scenario();
      const other = await scenario();
      const doomedRows = await seedEvalRows(doomed);
      const otherRows = await seedEvalRows(other);
      expect(await evalRowCounts(doomedRows)).toEqual({ cases: 2, suiteRuns: 1, results: 1 });

      const res = await app.inject({ method: 'DELETE', url: `/agents/${doomed.agent.id}` });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      expect(await db.select().from(t.agents).where(eq(t.agents.id, doomed.agent.id))).toHaveLength(0);
      expect(await casesOf(doomed.agent.id)).toHaveLength(0);
      expect(await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, doomed.agent.id))).toHaveLength(0);
      expect(await evalRowCounts(doomedRows)).toEqual({ cases: 0, suiteRuns: 0, results: 0 });
      // The other agent keeps every row.
      expect(await db.select().from(t.agents).where(eq(t.agents.id, other.agent.id))).toHaveLength(1);
      expect(await evalRowCounts(otherRows)).toEqual({ cases: 2, suiteRuns: 1, results: 1 });
    });

    it('answers 404 for another workspace\'s agent and deletes neither the agent nor its cases', async () => {
      const db = pg.handle.db;
      const app = await appWith();
      const [otherWs] = await db.insert(t.workspaces).values({ name: `other-ws-${seq++}` }).returning();
      const foreign = await scenario({ ws: otherWs!.id });
      const rows = await seedEvalRows(foreign, otherWs!.id);

      const res = await app.inject({ method: 'DELETE', url: `/agents/${foreign.agent.id}` });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
      expect(await db.select().from(t.agents).where(eq(t.agents.id, foreign.agent.id))).toHaveLength(1);
      expect(await evalRowCounts(rows)).toEqual({ cases: 2, suiteRuns: 1, results: 1 });
    });
  });
  // ==========================================================================
  // Phase 6 — run routes
  // ==========================================================================
  describe('eval runs (phase 6)', () => {
    type Scenario = Awaited<ReturnType<typeof scenario>>;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    /** Poll until `cond` holds; throws after `ms`. */
    async function until(cond: () => boolean | Promise<boolean>, what: string, ms = 5_000) {
      const t0 = Date.now();
      while (!(await cond())) {
        if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
        await sleep(10);
      }
    }

    /** The diff of a case: line 2 is the added line, so a finding on line 2 is grounded. */
    const caseDiff = (marker: string) =>
      [
        `diff --git a/${FILE} b/${FILE}`,
        `--- a/${FILE}`,
        `+++ b/${FILE}`,
        '@@ -1,3 +1,4 @@',
        ' line one',
        `+marker-${marker}`,
        ' line three',
        ' line four',
      ].join('\n');

    /** A model answer with one finding on line 2 of the case's file (grounded). */
    const reviewAt = (line = 2): Review => ({
      verdict: 'comment',
      summary: 'One finding.',
      score: 70,
      findings: [
        {
          id: 'f-1',
          severity: 'WARNING',
          category: 'bug',
          title: 'Scripted finding',
          file: FILE,
          start_line: line,
          end_line: line,
          rationale: 'r',
          confidence: 0.9,
          kind: 'finding',
        },
      ],
    });

    interface CaseSpec {
      kind?: 'must_find' | 'must_not_flag';
      start?: number;
      end?: number;
      marker?: string;
    }

    /** Eval cases inserted directly, owned by the scenario's agent. Names are `case-<i>`. */
    async function addCases(s: Scenario, specs: CaseSpec[], ws: string = workspaceId) {
      return pg.handle.db
        .insert(t.evalCases)
        .values(
          specs.map((c, i) => ({
            workspaceId: ws,
            ownerKind: 'agent' as const,
            ownerId: s.agent.id,
            name: `case-${String(i).padStart(2, '0')}`,
            inputDiff: caseDiff(c.marker ?? `m${i}`),
            inputFiles: [FILE],
            inputMeta: {
              pr_id: s.pr.id,
              pr_number: s.pr.number,
              repo: 'acme/x',
              pr_title: 'Harden config loading',
              pr_body: 'Loads the config safely.',
              pr_author: 'marisa.koch',
              head_sha: HEAD,
            },
            expectedOutput: {
              kind: c.kind ?? ('must_find' as const),
              file: FILE,
              start_line: c.start ?? 1,
              end_line: c.end ?? 3,
              title: `expected ${i}`,
              severity: 'WARNING' as const,
              category: 'bug' as const,
            },
          })),
        )
        .returning();
    }

    /** A model whose every call waits on one gate; `release()` lets them all go. */
    function gatedLlm(answer: (req: { text: string }, i: number) => unknown = () => reviewAt()) {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const llm = new ScriptedLLMProvider('openai', async (req, i) => {
        await gate;
        return answer({ text: JSON.stringify(req.messages) }, i);
      });
      return { llm, release };
    }
    const modelCalls = (llm: ScriptedLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured');

    const startRun = (app: App, agentId: string) =>
      app.inject({ method: 'POST', url: `/agents/${agentId}/eval-runs` });
    const suiteRows = (agentId: string) =>
      pg.handle.db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.agentId, agentId));
    const tableCounts = async () => {
      const db = pg.handle.db;
      return {
        reviews: (await db.select({ id: t.reviews.id }).from(t.reviews)).length,
        findings: (await db.select({ id: t.findings.id }).from(t.findings)).length,
        agentRuns: (await db.select({ id: t.agentRuns.id }).from(t.agentRuns)).length,
      };
    };

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => void unhandled.push(reason);
    beforeAll(() => void process.on('unhandledRejection', onUnhandled));
    afterAll(() => void process.off('unhandledRejection', onUnhandled));

    it('answers 202 running with the stored snapshot for a disabled agent, and the model gets that snapshot (R-SRV-15, R-SRV-16, R-SRV-17)', async () => {
      const db = pg.handle.db;
      const { llm, release } = gatedLlm();
      const app = await appWith(undefined, llm);
      const s = await scenario();
      await db
        .update(t.agents)
        .set({ enabled: false, version: 4, systemPrompt: 'Snapshot prompt', model: 'gpt-4o-mini', strategy: 'map-reduce' })
        .where(eq(t.agents.id, s.agent.id));
      const mk = async (name: string, version: number, enabled: boolean) =>
        (
          await db
            .insert(t.skills)
            .values({
              workspaceId,
              name: `${name}-${seq++}`,
              description: 'd',
              type: 'rubric',
              source: 'manual',
              body: `BODY-OF-${name}`,
              enabled,
              version,
            })
            .returning()
        )[0]!;
      const late = await mk('sk-late', 5, true);
      const early = await mk('sk-early', 3, true);
      const off = await mk('sk-off', 1, false);
      await db.insert(t.agentSkills).values([
        { agentId: s.agent.id, skillId: late.id, order: 1 },
        { agentId: s.agent.id, skillId: early.id, order: 0 },
        { agentId: s.agent.id, skillId: off.id, order: 2 },
      ]);
      await addCases(s, [{}]);

      try {
        const res = await startRun(app, s.agent.id);

        expect(res.statusCode).toBe(202);
        const run = res.json() as EvalSuiteRun;
        expect(run).toMatchObject({
          agent_id: s.agent.id,
          agent_name: s.agent.name,
          status: 'running',
          cases_total: 1,
          cases_done: 0,
          finished_at: null,
          error: null,
          config: {
            agent_version: 4,
            system_prompt: 'Snapshot prompt',
            provider: 'openai',
            model: 'gpt-4o-mini',
            strategy: 'map-reduce',
            skills: [
              { name: early.name, version: 3 },
              { name: late.name, version: 5 },
            ],
          },
        });
        const stored = (await suiteRows(s.agent.id))[0]!;
        expect(stored).toMatchObject({ agentVersion: 4, systemPrompt: 'Snapshot prompt', status: 'running' });

        await until(() => modelCalls(llm).length === 1, 'the model call');
        const req = modelCalls(llm)[0]!.req as { model: string; messages: unknown };
        const sent = JSON.stringify(req.messages);
        expect(req.model).toBe('gpt-4o-mini');
        expect(sent).toContain('Snapshot prompt');
        expect(sent).toContain(`### ${early.name} (v3)`);
        expect(sent).toContain('BODY-OF-sk-early');
        expect(sent).not.toContain('BODY-OF-sk-off');
        expect(sent.indexOf('BODY-OF-sk-early')).toBeLessThan(sent.indexOf('BODY-OF-sk-late'));
      } finally {
        release();
      }
      const final = await waitForEvalRun(app, ((await suiteRows(s.agent.id))[0]!).id);
      expect(final.status).toBe('done');
    });

    it('runs every case to done with one result each, one model call per case, and no review, finding or agent-run row (R-SRV-18, R-SRV-25, R-SRV-26, R-SRV-39)', async () => {
      const llm = new ScriptedLLMProvider('openai', () => reviewAt());
      const app = await appWith(undefined, llm);
      const s = await scenario();
      await addCases(s, [{}, {}, { kind: 'must_not_flag' }]);
      const before = await tableCounts();

      const res = await startRun(app, s.agent.id);
      expect(res.statusCode).toBe(202);
      const final = await waitForEvalRun(app, (res.json() as EvalSuiteRun).id);

      expect(final.status).toBe('done');
      expect(final.error).toBeNull();
      expect(final.finished_at).not.toBeNull();
      expect(final).toMatchObject({ cases_total: 3, cases_done: 3, cases_passed: 2, cases_errored: 0 });
      expect(final.results).toHaveLength(3);
      expect(final.recall).toBe(1);
      expect(final.precision).toBeCloseTo(2 / 3, 6);
      expect(final.citation_accuracy).toBe(1);
      expect(final.cost_usd).toBeCloseTo(0.003, 6);
      expect(modelCalls(llm)).toHaveLength(3);
      expect(await tableCounts()).toEqual(before);
    });

    it('answers 409 while a run is going, and two concurrent POSTs create at most one run (R-SRV-27)', async () => {
      const { llm, release } = gatedLlm();
      const app = await appWith(undefined, llm);
      const s = await scenario();
      await addCases(s, [{}]);

      try {
        const [a, b] = await Promise.all([startRun(app, s.agent.id), startRun(app, s.agent.id)]);
        expect([a.statusCode, b.statusCode].sort()).toEqual([202, 409]);
        const loser = a.statusCode === 409 ? a : b;
        expect(loser.json().error).toMatchObject({
          code: 'eval_run_in_progress',
          message: 'An eval run of this agent is already running',
        });
        expect(await suiteRows(s.agent.id)).toHaveLength(1);

        const again = await startRun(app, s.agent.id);
        expect(again.statusCode).toBe(409);
        expect(await suiteRows(s.agent.id)).toHaveLength(1);
      } finally {
        release();
      }
      const [row] = await suiteRows(s.agent.id);
      await waitForEvalRun(app, row!.id);
      // Once the run has ended, the agent can run again.
      const next = await startRun(app, s.agent.id);
      expect(next.statusCode).toBe(202);
      await waitForEvalRun(app, (next.json() as EvalSuiteRun).id);
    });

    it('answers 422 and writes no run for an agent with no cases (R-SRV-28)', async () => {
      const app = await appWith(undefined, new ScriptedLLMProvider('openai', () => reviewAt()));
      const s = await scenario();

      const res = await startRun(app, s.agent.id);

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toMatchObject({ code: 'validation_error', message: 'This agent has no eval cases' });
      expect(await suiteRows(s.agent.id)).toHaveLength(0);
    });

    it('answers 422 and writes no run for an agent with 51 cases, and accepts exactly 50 (R-SRV-29)', async () => {
      const llm = new ScriptedLLMProvider('openai', () => reviewAt());
      const app = await appWith(undefined, llm);
      const s = await scenario();
      const cases = await addCases(s, Array.from({ length: 51 }, () => ({})));

      const res = await startRun(app, s.agent.id);

      expect(res.statusCode).toBe(422);
      expect(res.json().error).toMatchObject({
        code: 'validation_error',
        message: 'An eval run takes at most 50 cases; this agent has 51',
      });
      expect(await suiteRows(s.agent.id)).toHaveLength(0);
      expect(modelCalls(llm)).toHaveLength(0);

      await pg.handle.db.delete(t.evalCases).where(eq(t.evalCases.id, cases[0]!.id));
      const ok = await startRun(app, s.agent.id);
      expect(ok.statusCode).toBe(202);
      expect((await waitForEvalRun(app, (ok.json() as EvalSuiteRun).id, { timeoutMs: 30_000 })).cases_done).toBe(50);
    });

    it('answers 400 eval_unavailable and writes no run when the agent\'s provider has no key (R-SRV-30)', async () => {
      const app = await appWith(); // empty secrets, no llm override
      const s = await scenario();
      await addCases(s, [{}]);

      const res = await startRun(app, s.agent.id);

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatchObject({
        code: 'eval_unavailable',
        message: 'No API key for openai. Add it in Settings.',
      });
      expect(await suiteRows(s.agent.id)).toHaveLength(0);
    });

    it('leaves one errored row out of the metrics and still ends done (R-SRV-31)', async () => {
      const llm = new ScriptedLLMProvider('openai', (req) => {
        if (JSON.stringify(req.messages).includes('marker-boom')) throw new Error('scripted boom');
        return reviewAt();
      });
      const app = await appWith(undefined, llm);
      const s = await scenario();
      await addCases(s, [{}, { marker: 'boom' }, {}]);

      const final = await waitForEvalRun(app, ((await startRun(app, s.agent.id)).json() as EvalSuiteRun).id);

      expect(final.status).toBe('done');
      expect(final).toMatchObject({ cases_total: 3, cases_done: 3, cases_passed: 2, cases_errored: 1 });
      expect(final.recall).toBe(1);
      expect(final.precision).toBe(1);
      expect(final.cost_usd).toBeCloseTo(0.002, 6);
      const errored = final.results.filter((r) => r.outcome === 'errored');
      expect(errored).toHaveLength(1);
      expect(errored[0]).toMatchObject({ case_name: 'case-01', pass: null, recall: null, actual_output: null });
      expect(errored[0]!.error).toContain('scripted boom');
    });

    it('ends failed with "All n cases failed" when every case throws (R-SRV-32)', async () => {
      const llm = new ScriptedLLMProvider('openai', () => {
        throw new Error('scripted boom');
      });
      const app = await appWith(undefined, llm);
      const s = await scenario();
      await addCases(s, [{}, {}, {}]);

      const final = await waitForEvalRun(app, ((await startRun(app, s.agent.id)).json() as EvalSuiteRun).id);

      expect(final.status).toBe('failed');
      expect(final.error).toMatch(/^All 3 cases failed: .*scripted boom/);
      expect(final.finished_at).not.toBeNull();
      expect(final).toMatchObject({ cases_total: 3, cases_done: 3, cases_errored: 3, recall: null, precision: null });
      expect(final.results.every((r) => r.outcome === 'errored')).toBe(true);
    });

    it('drops a case deleted while its review is held: the run ends done with no row for it and it counts in no metric (R-SRV-48, AC-99)', async () => {
      const { llm, release } = gatedLlm();
      const app = await appWith(undefined, llm);
      const s = await scenario();
      // case-00 matches the scripted finding (line 2); case-01 expects lines 100-110, so it fails.
      const [passing, failing] = await addCases(s, [{}, { start: 100, end: 110 }]);

      const run = (await startRun(app, s.agent.id)).json() as EvalSuiteRun;
      try {
        await until(() => modelCalls(llm).length === 2, 'both model calls');
        const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${passing!.id}` });
        expect(del.statusCode).toBe(204);
      } finally {
        release();
      }
      const final = await waitForEvalRun(app, run.id);

      expect(final.status).toBe('done');
      expect(final.error).toBeNull();
      expect(final.cases_total).toBe(2); // the snapshot taken at start
      expect(final.cases_done).toBe(1);
      expect(final.results.map((r) => r.case_id)).toEqual([failing!.id]);
      // Counted, the deleted passing case would give recall 0.5 and one pass.
      expect(final).toMatchObject({ cases_passed: 0, cases_errored: 0, recall: 0 });
      const results = await pg.handle.db.select().from(t.evalRuns).where(eq(t.evalRuns.suiteRunId, run.id));
      expect(results.map((r) => r.caseId)).toEqual([failing!.id]);
      expect(unhandled).toEqual([]);
    });

    it('ends done with null metrics when every case was deleted mid-run (Q10)', async () => {
      const { llm, release } = gatedLlm();
      const app = await appWith(undefined, llm);
      const s = await scenario();
      const cases = await addCases(s, [{}, {}]);

      const run = (await startRun(app, s.agent.id)).json() as EvalSuiteRun;
      try {
        await until(() => modelCalls(llm).length === 2, 'both model calls');
        for (const c of cases) {
          expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).statusCode).toBe(204);
        }
      } finally {
        release();
      }
      const final = await waitForEvalRun(app, run.id);

      expect(final).toMatchObject({
        status: 'done',
        cases_total: 2,
        cases_done: 0,
        cases_passed: 0,
        cases_errored: 0,
        recall: null,
        precision: null,
        citation_accuracy: null,
        cost_usd: null,
      });
      expect(final.results).toEqual([]);
    });

    it('stops quietly when the run row is gone mid-run: no further case is reviewed, nothing is stored (F16, run_gone)', async () => {
      const db = pg.handle.db;
      const { llm, release } = gatedLlm();
      const app = await appWith(undefined, llm);
      const s = await scenario();
      const cases = await addCases(s, [{}, {}, {}, {}]); // 3 in flight at once, the 4th waits

      const run = (await startRun(app, s.agent.id)).json() as EvalSuiteRun;
      try {
        await until(() => modelCalls(llm).length === 3, 'three model calls');
        await db.delete(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, run.id));
      } finally {
        release();
      }
      await sleep(400); // the three held calls finish and try to store

      expect(modelCalls(llm)).toHaveLength(3);
      expect(await db.select().from(t.evalRuns).where(eq(t.evalRuns.suiteRunId, run.id))).toHaveLength(0);
      // The cases are untouched and the agent is free to run again.
      expect(await casesOf(s.agent.id)).toHaveLength(cases.length);
      expect(await suiteRows(s.agent.id)).toHaveLength(0);
      expect(unhandled).toEqual([]);
    });

    it('storeResult tells a deleted case from a deleted run by the foreign key that failed, and writes nothing then (R-SRV-39, F16)', async () => {
      const db = pg.handle.db;
      const repo = new EvalRepository(db);
      const s = await scenario();
      const [c0, c1] = await addCases(s, [{}, {}]);
      const [suite] = await db
        .insert(t.evalSuiteRuns)
        .values({
          workspaceId,
          agentId: s.agent.id,
          agentVersion: 1,
          systemPrompt: 'Review.',
          provider: 'openai',
          model: 'gpt-4o',
          strategy: 'single-pass',
          skills: [],
          status: 'running',
          casesTotal: 2,
        })
        .returning();
      const row = (caseId: string) => ({
        caseId,
        pass: true,
        recall: 1,
        precision: 1,
        citationAccuracy: 1,
        actualOutput: { findings: [], dropped: 0 },
        durationMs: 3,
        costUsd: 0.001,
        error: null,
      });
      const doneCount = async () =>
        (await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, suite!.id)))[0]!.casesDone;
      const resultCount = async () =>
        (await db.select().from(t.evalRuns).where(eq(t.evalRuns.suiteRunId, suite!.id))).length;

      // Both parents exist: the row is stored and cases_done moves with it, in one transaction.
      expect(await repo.storeResult(suite!.id, row(c0!.id))).toBe('stored');
      expect([await resultCount(), await doneCount()]).toEqual([1, 1]);

      // The case is gone, the run is not.
      expect(await repo.storeResult(suite!.id, row(UNKNOWN_ID))).toBe('case_gone');
      expect([await resultCount(), await doneCount()]).toEqual([1, 1]);

      // The run is gone, the case is not.
      expect(await repo.storeResult(UNKNOWN_ID, row(c1!.id))).toBe('run_gone');
      expect(await db.select().from(t.evalRuns).where(eq(t.evalRuns.caseId, c1!.id))).toHaveLength(0);
      expect([await resultCount(), await doneCount()]).toEqual([1, 1]);
    });

    it('removes the run with the agent when the agent is deleted mid-run, and logs no unhandled rejection (F16)', async () => {
      const db = pg.handle.db;
      const { llm, release } = gatedLlm();
      const app = await appWith(undefined, llm);
      const s = await scenario();
      await addCases(s, [{}, {}]);

      const run = (await startRun(app, s.agent.id)).json() as EvalSuiteRun;
      try {
        await until(() => modelCalls(llm).length === 2, 'both model calls');
        const del = await app.inject({ method: 'DELETE', url: `/agents/${s.agent.id}` });
        expect(del.statusCode).toBe(200);
      } finally {
        release();
      }
      await sleep(400);

      expect(await suiteRows(s.agent.id)).toHaveLength(0);
      expect(await db.select().from(t.evalRuns).where(eq(t.evalRuns.suiteRunId, run.id))).toHaveLength(0);
      expect((await app.inject({ method: 'GET', url: `/eval-runs/${run.id}` })).statusCode).toBe(404);
      expect(unhandled).toEqual([]);
    });

    it('marks a run left running by a dead process failed "Interrupted by server restart" when the next app boots (R-SRV-33)', async () => {
      const db = pg.handle.db;
      const s = await scenario();
      const base = {
        workspaceId,
        agentId: s.agent.id,
        agentVersion: 1,
        systemPrompt: 'Review.',
        provider: 'openai' as const,
        model: 'gpt-4o',
        strategy: 'single-pass' as const,
        skills: [],
        casesTotal: 2,
      };
      const [orphan] = await db.insert(t.evalSuiteRuns).values({ ...base, status: 'running', casesDone: 1 }).returning();
      const [finished] = await db
        .insert(t.evalSuiteRuns)
        .values({ ...base, status: 'done', casesDone: 2, finishedAt: new Date(), recall: 1 })
        .returning();

      const app = await appWith(); // the boot reap runs inside buildApp

      const [after] = await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, orphan!.id));
      expect(after).toMatchObject({ status: 'failed', error: 'Interrupted by server restart', casesDone: 1 });
      expect(after!.finishedAt).not.toBeNull();
      const [untouched] = await db.select().from(t.evalSuiteRuns).where(eq(t.evalSuiteRuns.id, finished!.id));
      expect(untouched).toEqual(finished);
      const detail = (await app.inject({ method: 'GET', url: `/eval-runs/${orphan!.id}` })).json() as EvalSuiteRunDetail;
      expect(detail).toMatchObject({ status: 'failed', error: 'Interrupted by server restart' });
    });

    describe('listing and detail', () => {
      const suiteValues = (s: Scenario, o: Partial<typeof t.evalSuiteRuns.$inferInsert> = {}) => ({
        workspaceId,
        agentId: s.agent.id,
        agentVersion: 1,
        systemPrompt: 'Review.',
        provider: 'openai' as const,
        model: 'gpt-4o',
        strategy: 'single-pass' as const,
        skills: [{ name: 'sk', version: 2 }],
        status: 'done' as const,
        casesTotal: 2,
        casesDone: 2,
        finishedAt: new Date(),
        ...o,
      });

      it('pages the agent\'s runs newest first with limit, offset and total, and never lists another agent\'s (R-SRV-38)', async () => {
        const db = pg.handle.db;
        const app = await appWith();
        const s = await scenario();
        const other = await scenario();
        const t0 = Date.parse('2026-10-01T00:00:00Z');
        const rows = await db
          .insert(t.evalSuiteRuns)
          .values(Array.from({ length: 5 }, (_, i) => suiteValues(s, { startedAt: new Date(t0 + i * 60_000) })))
          .returning();
        await db.insert(t.evalSuiteRuns).values(suiteValues(other));
        const newestFirst = [...rows].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).map((r) => r.id);

        const page = await app.inject({ method: 'GET', url: `/agents/${s.agent.id}/eval-runs?limit=2&offset=1` });
        const all = await app.inject({ method: 'GET', url: `/agents/${s.agent.id}/eval-runs` });

        expect(page.statusCode).toBe(200);
        const body = page.json() as EvalSuiteRunList;
        expect(body.total).toBe(5);
        expect(body.runs.map((r) => r.id)).toEqual(newestFirst.slice(1, 3));
        expect(body.runs[0]).toMatchObject({ agent_id: s.agent.id, agent_name: s.agent.name, config: { skills: [{ name: 'sk', version: 2 }] } });
        expect((all.json() as EvalSuiteRunList).runs.map((r) => r.id)).toEqual(newestFirst);
        expect((all.json() as EvalSuiteRunList).total).toBe(5);
      });

      it('answers 422 for a limit outside 1..100 or a negative offset (R-SRV-38)', async () => {
        const app = await appWith();
        const s = await scenario();
        for (const q of ['limit=0', 'limit=101', 'offset=-1']) {
          const res = await app.inject({ method: 'GET', url: `/agents/${s.agent.id}/eval-runs?${q}` });
          expect(res.statusCode, q).toBe(422);
        }
        const edge = await app.inject({ method: 'GET', url: `/agents/${s.agent.id}/eval-runs?limit=100` });
        expect(edge.statusCode).toBe(200);
        expect(edge.json()).toEqual({ runs: [], total: 0 });
      });

      it('returns the detail with results ordered by case name, each with kind, expectation, outcome and matches flags (R-SRV-40)', async () => {
        const db = pg.handle.db;
        const app = await appWith();
        const s = await scenario();
        // Names case-00, case-01, case-02; inserted out of order below.
        const [c0, c1, c2] = await addCases(s, [{}, { kind: 'must_not_flag' }, {}]);
        const [suite] = await db.insert(t.evalSuiteRuns).values(suiteValues(s, { casesTotal: 3, casesDone: 3 })).returning();
        const found = (matches: boolean) => ({
          findings: [{ file: FILE, start_line: 2, end_line: 2, title: 'T', severity: 'WARNING', category: 'bug', matches }],
          dropped: 1,
        });
        await db.insert(t.evalRuns).values([
          { caseId: c2!.id, suiteRunId: suite!.id, error: 'scripted boom', durationMs: 5 },
          { caseId: c0!.id, suiteRunId: suite!.id, pass: true, recall: 1, precision: 1, citationAccuracy: 0.5, actualOutput: found(true), durationMs: 7, costUsd: 0.002 },
          { caseId: c1!.id, suiteRunId: suite!.id, pass: false, precision: 0, actualOutput: found(true), durationMs: 9, costUsd: 0.003 },
        ]);

        const res = await app.inject({ method: 'GET', url: `/eval-runs/${suite!.id}` });

        expect(res.statusCode).toBe(200);
        const body = res.json() as EvalSuiteRunDetail;
        expect(body.id).toBe(suite!.id);
        expect(body.agent_name).toBe(s.agent.name);
        expect(body.results.map((r) => r.case_name)).toEqual(['case-00', 'case-01', 'case-02']);
        expect(body.results.map((r) => r.outcome)).toEqual(['pass', 'fail', 'errored']);
        expect(body.results.map((r) => r.kind)).toEqual(['must_find', 'must_not_flag', 'must_find']);
        expect(body.results[0]).toMatchObject({
          case_id: c0!.id,
          suite_run_id: suite!.id,
          expectation: { kind: 'must_find', file: FILE, start_line: 1, end_line: 3 },
          pass: true,
          recall: 1,
          citation_accuracy: 0.5,
          duration_ms: 7,
          cost_usd: 0.002,
          error: null,
          actual_output: { dropped: 1, findings: [{ title: 'T', matches: true }] },
        });
        expect(body.results[2]).toMatchObject({ pass: null, actual_output: null, error: 'scripted boom' });
      });
    });

    it('answers 404 for another workspace\'s agent and run, and for unknown ids, and writes nothing (R-SRV-37)', async () => {
      const db = pg.handle.db;
      const llm = new ScriptedLLMProvider('openai', () => reviewAt());
      const app = await appWith(undefined, llm);
      const [otherWs] = await db.insert(t.workspaces).values({ name: `other-ws-${seq++}` }).returning();
      const foreign = await scenario({ ws: otherWs!.id });
      await addCases(foreign, [{}], otherWs!.id);
      const [foreignRun] = await db
        .insert(t.evalSuiteRuns)
        .values({
          workspaceId: otherWs!.id,
          agentId: foreign.agent.id,
          agentVersion: 1,
          systemPrompt: 'Review.',
          provider: 'openai',
          model: 'gpt-4o',
          strategy: 'single-pass',
          skills: [],
          status: 'done',
          casesTotal: 1,
          casesDone: 1,
          finishedAt: new Date(),
        })
        .returning();

      const responses = [
        await startRun(app, foreign.agent.id),
        await app.inject({ method: 'GET', url: `/agents/${foreign.agent.id}/eval-runs` }),
        await app.inject({ method: 'GET', url: `/eval-runs/${foreignRun!.id}` }),
        await startRun(app, UNKNOWN_ID),
        await app.inject({ method: 'GET', url: `/agents/${UNKNOWN_ID}/eval-runs` }),
        await app.inject({ method: 'GET', url: `/eval-runs/${UNKNOWN_ID}` }),
      ];

      for (const res of responses) {
        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe('not_found');
      }
      expect(await suiteRows(foreign.agent.id)).toHaveLength(1); // only the one inserted above
      expect(modelCalls(llm)).toHaveLength(0);
    });

    describe('GET /evals/overview (phase 7, R-SRV-41)', () => {
      /** A workspace of its own, so the seeded agents and eval rows of the default workspace do not mix in. */
      async function freshWorkspace() {
        const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: `overview-ws-${seq++}` }).returning();
        return ws!;
      }
      /** The app resolves this workspace as the current one, so the route reads it with no seed rows. */
      async function appFor(ws: { id: string; name: string }, llm?: LLMProvider) {
        const app = await buildApp({
          config: config(),
          db: pg.handle.db,
          overrides: {
            secrets: new MockSecretsProvider(),
            github: new MockGitHubClient(),
            git: new MockGitClient({ diff: '' }),
            auth: new MockAuthProvider(undefined, ws),
            ...(llm ? { llm: { openai: llm } } : {}),
          },
        });
        apps.push(app);
        return app;
      }
      async function agentIn(ws: string, name: string, enabled = true) {
        const [row] = await pg.handle.db
          .insert(t.agents)
          .values({ workspaceId: ws, name, provider: 'openai', model: 'gpt-4o', systemPrompt: 'Review.', enabled })
          .returning();
        return row!;
      }
      const T0 = Date.parse('2026-10-01T00:00:00Z');
      const minutes = (n: number) => new Date(T0 + n * 60_000);
      function suiteRun(
        ws: string,
        agentId: string,
        o: Partial<typeof t.evalSuiteRuns.$inferInsert> = {},
      ): typeof t.evalSuiteRuns.$inferInsert {
        return {
          workspaceId: ws,
          agentId,
          agentVersion: 1,
          systemPrompt: 'Review.',
          provider: 'openai',
          model: 'gpt-4o',
          strategy: 'single-pass',
          skills: [],
          status: 'done',
          casesTotal: 2,
          casesDone: 2,
          finishedAt: new Date(),
          ...o,
        };
      }
      const overview = async (app: App) => {
        const res = await app.inject({ method: 'GET', url: '/evals/overview' });
        expect(res.statusCode).toBe(200);
        return res.json() as EvalOverview;
      };

      it('lists every agent of the workspace by name, enabled or not, with its counts; an agent with no run has latest null and an empty trend', async () => {
        const db = pg.handle.db;
        const ws = await freshWorkspace();
        const other = await freshWorkspace();
        const zed = await agentIn(ws.id, 'zed-agent');
        const off = await agentIn(ws.id, 'beta-disabled', false);
        const idle = await agentIn(ws.id, 'alpha-idle');
        await agentIn(other.id, 'foreign-agent');
        await db.insert(t.evalSuiteRuns).values(suiteRun(ws.id, zed.id, { startedAt: minutes(1), recall: 0.5 }));
        await db.insert(t.evalSuiteRuns).values(suiteRun(ws.id, off.id, { startedAt: minutes(2), recall: 1 }));
        await addCases({ agent: zed, pr: { id: UNKNOWN_ID, number: 1 } } as unknown as Scenario, [{}, {}, {}], ws.id);
        const app = await appFor(ws);

        const body = await overview(app);

        expect(body.agents.map((a) => a.agent_name)).toEqual(['alpha-idle', 'beta-disabled', 'zed-agent']);
        const [idleOv, offOv, zedOv] = body.agents;
        expect(idleOv).toMatchObject({
          agent_id: idle.id,
          provider: 'openai',
          model: 'gpt-4o',
          enabled: true,
          cases_total: 0,
          runs_total: 0,
          running: false,
          latest: null,
          recall_trend: [],
        });
        expect(offOv).toMatchObject({ agent_id: off.id, enabled: false, cases_total: 0, runs_total: 1, recall_trend: [1] });
        expect(zedOv).toMatchObject({ agent_id: zed.id, enabled: true, cases_total: 3, runs_total: 1, recall_trend: [0.5] });
        expect(zedOv!.latest).toMatchObject({
          agent_id: zed.id,
          agent_name: 'zed-agent',
          status: 'done',
          recall: 0.5,
          started_at: minutes(1).toISOString(),
          config: { agent_version: 1, system_prompt: 'Review.', provider: 'openai', model: 'gpt-4o', strategy: 'single-pass', skills: [] },
        });
      });

      it('takes latest from the newest done run even when a newer failed run exists, and keeps the failed run out of the trend', async () => {
        const db = pg.handle.db;
        const ws = await freshWorkspace();
        const agent = await agentIn(ws.id, 'flaky');
        const [older, newerDone] = await db
          .insert(t.evalSuiteRuns)
          .values([
            suiteRun(ws.id, agent.id, { startedAt: minutes(1), recall: 0.25 }),
            suiteRun(ws.id, agent.id, { startedAt: minutes(2), recall: 0.75 }),
          ])
          .returning();
        await db
          .insert(t.evalSuiteRuns)
          .values(suiteRun(ws.id, agent.id, { startedAt: minutes(3), status: 'failed', error: 'All 2 cases failed: boom', recall: null }));
        const app = await appFor(ws);

        const [ov] = (await overview(app)).agents;

        expect(older!.id).not.toBe(newerDone!.id);
        expect(ov!.latest!.id).toBe(newerDone!.id);
        expect(ov).toMatchObject({ runs_total: 3, running: false, recall_trend: [0.25, 0.75] });
      });

      it('shows running: true while a run of the agent is held, and false again once it ends', async () => {
        const ws = await freshWorkspace();
        const { llm, release } = gatedLlm();
        const app = await appFor(ws, llm);
        const s = await scenario({ ws: ws.id });
        await addCases(s, [{}], ws.id);

        const run = (await startRun(app, s.agent.id)).json() as EvalSuiteRun;
        let during: EvalOverview;
        try {
          await until(() => modelCalls(llm).length === 1, 'the model call');
          during = await overview(app);
        } finally {
          release();
        }
        await waitForEvalRun(app, run.id);
        const after = await overview(app);

        expect(during.agents.find((a) => a.agent_id === s.agent.id)).toMatchObject({ running: true, latest: null, runs_total: 1 });
        expect(during.recent_runs[0]).toMatchObject({ id: run.id, status: 'running' });
        expect(after.agents.find((a) => a.agent_id === s.agent.id)).toMatchObject({ running: false, runs_total: 1 });
        expect(after.agents.find((a) => a.agent_id === s.agent.id)!.latest!.id).toBe(run.id);
      });

      it('caps recall_trend at the last 10 done runs, oldest first, whatever the insert order', async () => {
        const db = pg.handle.db;
        const ws = await freshWorkspace();
        const agent = await agentIn(ws.id, 'trender');
        // Twelve done runs recall 0.01 .. 0.12; inserted newest first so the order cannot come from the insert.
        const recalls = Array.from({ length: 12 }, (_, i) => (i + 1) / 100);
        await db
          .insert(t.evalSuiteRuns)
          .values(recalls.map((r, i) => suiteRun(ws.id, agent.id, { startedAt: minutes(i), recall: r })).reverse());
        const app = await appFor(ws);

        const [ov] = (await overview(app)).agents;

        expect(ov!.runs_total).toBe(12);
        expect(ov!.recall_trend).toEqual(recalls.slice(2)); // the 10 newest, oldest first
        expect(ov!.latest!.recall).toBe(0.12);
      });

      it('returns the 6 newest runs of the workspace across agents, any status, newest first, each with its agent name, and none of another workspace', async () => {
        const db = pg.handle.db;
        const ws = await freshWorkspace();
        const other = await freshWorkspace();
        const a = await agentIn(ws.id, 'agent-a');
        const b = await agentIn(ws.id, 'agent-b');
        const foreign = await agentIn(other.id, 'agent-foreign');
        // The app first: building it reaps every `running` row, which would turn the seeded one `failed`.
        const app = await appFor(ws);
        const statuses = ['done', 'failed', 'running', 'done', 'failed', 'done', 'done', 'done'] as const;
        const inserted = await db
          .insert(t.evalSuiteRuns)
          .values(
            statuses.map((status, i) =>
              suiteRun(ws.id, i % 2 === 0 ? a.id : b.id, {
                startedAt: minutes(i),
                status,
                finishedAt: status === 'running' ? null : new Date(),
                recall: null,
              }),
            ),
          )
          .returning();
        // A newer run in another workspace must not appear.
        await db.insert(t.evalSuiteRuns).values(suiteRun(other.id, foreign.id, { startedAt: minutes(50) }));

        const { recent_runs } = await overview(app);

        const byTime = [...inserted].sort((x, y) => y.startedAt.getTime() - x.startedAt.getTime());
        expect(recent_runs.map((r) => r.id)).toEqual(byTime.slice(0, 6).map((r) => r.id));
        expect(recent_runs.map((r) => r.status)).toEqual(['done', 'done', 'done', 'failed', 'done', 'running']);
        expect(recent_runs.map((r) => r.agent_name)).toEqual(['agent-b', 'agent-a', 'agent-b', 'agent-a', 'agent-b', 'agent-a']);
      });
    });
  });
});
