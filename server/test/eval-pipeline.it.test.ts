/**
 * L06 eval module, case routes, against a real Postgres, the built app and `app.inject`:
 *   POST   /findings/:id/eval-case
 *   GET    /agents/:id/eval-cases
 *   DELETE /eval-cases/:id
 * The outside world is replaced through `overrides` (an empty `MockSecretsProvider`, so
 * `~/.devdigest/secrets.json` is never read, `MockGitHubClient` and `MockGitClient`): no key, no network.
 * Each test inserts its own agent, repo, PR, review and findings, so counts never depend on the seed.
 * Spec: `server/specs/eval-pipeline.md` (R-SRV-1–R-SRV-14, R-SRV-37); plan: `specs/plans/eval-pipeline.md`, phase 4.
 * Not covered here: the run routes (phase 6), the 1,500-line cut (`eval-domain.test.ts`).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { EvalCaseCreateResponse, EvalCaseList } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed, DEFAULT_WORKSPACE_NAME } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../src/adapters/mocks.js';
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

  async function appWith(git: MockGitClient = new MockGitClient({ diff: '' })) {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { secrets: new MockSecretsProvider(), github: new MockGitHubClient(), git },
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
});
