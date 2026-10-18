/**
 * `GET` / `POST /pulls/:id/brief` (`modules/brief/routes.ts`) against a real Postgres, the built
 * app and `app.inject`. The outside world is replaced through `overrides`: an empty
 * `MockSecretsProvider` (so `~/.devdigest/secrets.json` is never read), `MockGitHubClient` and a
 * `MockLLMProvider` with a `PrBriefDraft` fixture — no key, no network.
 * Spec: `server/specs/L05-pr-brief.md`; plan: `specs/plans/L05-pr-brief.md`, phase 4.
 * Not covered here: the 60 s call timeout (the route fixes it; `brief-service.test.ts` covers it
 * with a 20 ms seam), the log lines (no logger hook in the built app; `brief-service.test.ts`),
 * the 429 (`brief-rate-limit.test.ts`).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockLLMProvider, MockSecretsProvider, type MockGitHubOptions } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const HEAD = 'c0ffee000001';
const OVERRIDE_MODEL = 'z-ai/glm-4.7-flash';
const PATCH_ADDED_LINE = '+  stripeKey: "PATCHLINE-sk_live_xxx",';
const PATCH = ['@@ -10,3 +10,4 @@ export const config = {', '   port: 3000,', PATCH_ADDED_LINE, '   redisUrl: x,'].join('\n');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const DRAFT = {
  summary: 'Adds a rate limiter and commits a live key.',
  risks: [
    { kind: 'security', title: 'Key committed', explanation: 'A live key is in the config.', severity: 'high', file_refs: ['src/config.ts:12'] },
    { kind: 'other', title: 'Invented risk', explanation: 'Cites nothing real.', severity: 'low', file_refs: ['src/nowhere.ts'] },
  ],
  review_focus: [
    { file: 'src/config.ts', line: 400, reason: 'the key' },
    { file: 'src/nowhere.ts', line: 1, reason: 'not in the PR' },
  ],
};

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

/** A provider whose structured call fails. */
class ThrowingLLM extends MockLLMProvider {
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    throw new Error('provider exploded');
  }
}

/** A provider that answers after `delayMs`, so two requests overlap. */
class SlowLLM extends MockLLMProvider {
  private resolveStarted!: () => void;
  readonly started = new Promise<void>((resolve) => {
    this.resolveStarted = resolve;
  });
  constructor(private readonly gate: Promise<void>) {
    super('openai', { structuredBySchema: { PrBriefDraft: DRAFT } });
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.resolveStarted();
    await this.gate;
    return super.completeStructured(req);
  }
}

d('L05 brief routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((a) => a.close()));
  });

  afterAll(async () => {
    await pg?.stop();
  });

  async function appWith(
    o: {
      github?: MockGitHubOptions | MockGitHubClient;
      llm?: MockLLMProvider;
      openrouter?: MockLLMProvider;
      noKey?: boolean;
    } = {},
  ) {
    const llm = o.llm ?? new MockLLMProvider('openai', { structuredBySchema: { PrBriefDraft: DRAFT } });
    const github = o.github instanceof MockGitHubClient ? o.github : new MockGitHubClient(o.github);
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github,
        llm: o.noKey ? {} : { openai: llm, ...(o.openrouter ? { openrouter: o.openrouter } : {}) },
      },
    });
    apps.push(app);
    return { app, llm, github };
  }

  /** A repository with one PR and, unless `files` is empty, its changed files (default: `src/config.ts`). */
  async function newPr(
    o: {
      body?: string | null;
      status?: 'needs_review' | 'merged';
      files?: { path: string; additions: number; deletions: number; patch: string | null }[];
    } = {},
  ) {
    const name = `brief-api-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 700 + seq,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: HEAD,
        additions: 4,
        deletions: 0,
        filesCount: 1,
        status: o.status ?? 'needs_review',
        body: o.body === undefined ? 'Add rate limiting.' : o.body,
      })
      .returning();
    const files = o.files ?? [{ path: 'src/config.ts', additions: 4, deletions: 0, patch: PATCH }];
    if (files.length > 0) await pg.handle.db.insert(t.prFiles).values(files.map((f) => ({ prId: pr!.id, ...f })));
    return pr!;
  }

  const rowsFor = (prId: string) => pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
  const post = (app: Awaited<ReturnType<typeof appWith>>['app'], prId: string) =>
    app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
  const get = (app: Awaited<ReturnType<typeof appWith>>['app'], prId: string) =>
    app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
  const completeCalls = (llm: MockLLMProvider) =>
    llm.calls.filter((c) => c.method === 'completeStructured').map((c) => c.req as StructuredRequest<unknown>);

  it('GET answers { brief: null } for a PR with no stored brief', async () => {
    const { app } = await appWith();
    const pr = await newPr();

    const res = await get(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null });
  });

  it('POST answers the validated brief, stores it with the head SHA, and makes exactly one model call', async () => {
    const { app, llm } = await appWith();
    const pr = await newPr();

    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    const { brief } = res.json();
    expect(brief).toMatchObject({
      pr_id: pr.id,
      head_sha: HEAD,
      summary: DRAFT.summary,
      stale: false,
      provider: 'openai',
      model: 'gpt-4.1',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
      input_budget_tokens: 8000,
      history: { history: [] },
      // The invented risk and the invented focus file are dropped; the line moves into the hunk.
      dropped: { risks: 1, review_focus: 1 },
    });
    expect(brief.risks.risks.map((r: { title: string }) => r.title)).toEqual(['Key committed']);
    expect(brief.review_focus).toEqual([{ file: 'src/config.ts', line: 10, reason: 'the key' }]);
    expect(brief.input_tokens).toEqual(expect.any(Number));
    expect(brief.inputs.map((i: { kind: string }) => i.kind)).toEqual([
      'intent',
      'blast_radius',
      'diff_stats',
      'description',
      'linked_issue',
      'spec_documents',
    ]);
    expect(completeCalls(llm)).toHaveLength(1);

    // Stored: the record without `stale`.
    const [row] = await rowsFor(pr.id);
    const { stale: _stale, ...stored } = brief;
    expect(row!.json).toEqual(stored);
  });

  it('GET after POST answers the stored brief and calls neither the model nor GitHub', async () => {
    const llm = counting(new MockLLMProvider('openai', { structuredBySchema: { PrBriefDraft: DRAFT } }));
    const github = counting(new MockGitHubClient());
    const { app } = await appWith({ llm: llm.proxy, github: github.proxy });
    const pr = await newPr({ body: 'Closes #471.' });

    const posted = await post(app, pr.id);
    expect(posted.statusCode).toBe(200);
    llm.calls.length = 0;
    github.calls.length = 0;

    const res = await get(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(posted.json());
    expect(llm.calls).toEqual([]);
    expect(github.calls).toEqual([]);
  });

  it('stale becomes true after the head SHA changes and false again after another POST', async () => {
    const { app } = await appWith();
    const pr = await newPr();

    await post(app, pr.id);
    expect((await get(app, pr.id)).json().brief.stale).toBe(false);

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'c0ffee000002' }).where(eq(t.pullRequests.id, pr.id));
    expect((await get(app, pr.id)).json().brief).toMatchObject({ stale: true, head_sha: HEAD });

    const again = await post(app, pr.id);
    expect(again.json().brief).toMatchObject({ stale: false, head_sha: 'c0ffee000002' });
    expect(await rowsFor(pr.id)).toHaveLength(1);
  });

  it('uses the risk_brief override set by PUT /settings, not the default model', async () => {
    const llmDefault = new MockLLMProvider('openai', { structuredBySchema: { PrBriefDraft: DRAFT } });
    const llmOverride = new MockLLMProvider('openrouter', { structuredBySchema: { PrBriefDraft: DRAFT } });
    const { app } = await appWith({ llm: llmDefault, openrouter: llmOverride });
    const pr = await newPr();

    try {
      const put = await app.inject({
        method: 'PUT',
        url: '/settings',
        payload: { feature_models: { risk_brief: { provider: 'openrouter', model: OVERRIDE_MODEL } } },
      });
      expect(put.statusCode).toBe(200);

      const res = await post(app, pr.id);
      expect(res.statusCode).toBe(200);
      expect(res.json().brief).toMatchObject({ provider: 'openrouter', model: OVERRIDE_MODEL });
      expect(completeCalls(llmDefault)).toEqual([]);
      expect(completeCalls(llmOverride)).toHaveLength(1);
      expect(completeCalls(llmOverride)[0]).toMatchObject({ model: OVERRIDE_MODEL });
    } finally {
      // Settings are shared by every test in this file: put the default back.
      await pg.handle.db
        .delete(t.settings)
        .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
    }
  });

  it('generates with no stored intent and leaves the intent store untouched (R-SRV-13, R-SRV-27)', async () => {
    const { app, llm } = await appWith();
    const withoutIntent = await newPr();
    const withIntent = await newPr();
    await pg.handle.db.insert(t.prIntent).values({
      prId: withIntent.id,
      intent: 'Stored summary of the intent.',
      inScope: ['Limiter'],
      outOfScope: ['Quotas'],
    });
    const intentRows = () => pg.handle.db.select().from(t.prIntent);
    const before = await intentRows();

    const none = await post(app, withoutIntent.id);
    expect(none.statusCode).toBe(200);
    expect(none.json().brief.intent).toBeNull();
    expect(none.json().brief.inputs[0]).toEqual({ kind: 'intent', status: 'missing', reason: 'not_derived', omitted: null });

    const some = await post(app, withIntent.id);
    expect(some.statusCode).toBe(200);
    expect(some.json().brief.intent).toEqual({
      summary: 'Stored summary of the intent.',
      in_scope: ['Limiter'],
      out_of_scope: ['Quotas'],
    });
    expect(some.json().brief.inputs[0]).toMatchObject({ kind: 'intent', status: 'used', reason: null });

    // No derivation: the brief calls were the only model calls, and no intent row was written.
    expect(completeCalls(llm).every((r) => r.schemaName === 'PrBriefDraft')).toBe(true);
    expect(await intentRows()).toEqual(before);
  });

  it('records an empty blast map as missing, with the reason the blast route reports, and stores blast null', async () => {
    const { app } = await appWith();
    const pr = await newPr();

    const blast = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(blast.statusCode).toBe(200);
    expect(blast.json().changed_symbols).toEqual([]);

    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().brief.blast).toBeNull();
    expect(res.json().brief.inputs[1]).toEqual({
      kind: 'blast_radius',
      status: 'missing',
      reason: blast.json().reason ?? 'no_data',
      omitted: null,
    });
  });

  it('reads the linked issue once, and records no_token when GitHub has no token', async () => {
    const withToken = await appWith({ github: { issues: { 471: { number: 471, title: 'Rate limit', body: 'b', state: 'open' } } } });
    const pr = await newPr({ body: 'Add rate limiting. Closes #471.' });

    const res = await post(withToken.app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(withToken.github.issueRequests).toEqual([471]);
    expect(res.json().brief.inputs[4]).toEqual({ kind: 'linked_issue', status: 'used', reason: null, omitted: null });

    // No `github` override: the container resolves the token from the (empty) secrets store.
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        llm: { openai: new MockLLMProvider('openai', { structuredBySchema: { PrBriefDraft: DRAFT } }) },
      },
    });
    apps.push(app);
    const other = await newPr({ body: 'Closes #471.' });
    const noToken = await post(app, other.id);
    expect(noToken.statusCode).toBe(200);
    expect(noToken.json().brief.inputs[4]).toEqual({ kind: 'linked_issue', status: 'missing', reason: 'no_token', omitted: null });
  });

  it('sends the model the range numbers of a patch and none of its lines', async () => {
    const { app, llm } = await appWith();
    const pr = await newPr();

    expect((await post(app, pr.id)).statusCode).toBe(200);
    const [req] = completeCalls(llm);
    const prompt = req!.messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('+10..13');
    expect(prompt).not.toContain('PATCHLINE');
    expect(prompt).not.toContain('redisUrl');
  });

  it('answers 404 for an unknown pull request id on both routes', async () => {
    const { app, llm } = await appWith();

    for (const method of ['GET', 'POST'] as const) {
      const res = await app.inject({ method, url: `/pulls/${UNKNOWN_ID}/brief` });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    }
    expect(completeCalls(llm)).toEqual([]);
  });

  it('POST answers 422 validation_error for a PR with no stored file, with no model call', async () => {
    const { app, llm } = await appWith();
    const pr = await newPr({ files: [] });

    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({
      code: 'validation_error',
      message: "The PR's changed files are not loaded yet",
    });
    expect(completeCalls(llm)).toEqual([]);
    expect(await rowsFor(pr.id)).toHaveLength(0);
  });

  it('POST answers 400 brief_unavailable naming the provider when it has no key, with no GitHub call and no row', async () => {
    const { app, github } = await appWith({ noKey: true });
    const pr = await newPr({ body: 'Closes #471.' });

    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('brief_unavailable');
    expect(res.json().error.message).toContain('openai');
    expect(github.issueRequests).toEqual([]);
    expect(await rowsFor(pr.id)).toHaveLength(0);
  });

  it('POST answers 502 external_service_error when the provider throws, and when the answer fails its schema, leaving the stored row unchanged', async () => {
    const pr = await newPr();
    const good = await appWith();
    const posted = await post(good.app, pr.id);
    expect(posted.statusCode).toBe(200);
    const [stored] = await rowsFor(pr.id);

    const throwing = await appWith({ llm: new ThrowingLLM('openai') });
    const thrown = await post(throwing.app, pr.id);
    expect(thrown.statusCode).toBe(502);
    expect(thrown.json().error.code).toBe('external_service_error');

    const mismatch = await appWith({
      llm: new MockLLMProvider('openai', { structuredBySchema: { PrBriefDraft: { ...DRAFT, summary: '' } } }),
    });
    const bad = await post(mismatch.app, pr.id);
    expect(bad.statusCode).toBe(502);
    expect(bad.json().error.code).toBe('external_service_error');

    expect(await rowsFor(pr.id)).toEqual([stored]);

    // And with no stored row, a failure leaves none.
    const fresh = await newPr();
    expect((await post(throwing.app, fresh.id)).statusCode).toBe(502);
    expect(await rowsFor(fresh.id)).toHaveLength(0);
  });

  it('two concurrent POSTs for one PR make one model call and both answer the same brief', async () => {
    let release!: () => void;
    const slow = new SlowLLM(new Promise<void>((resolve) => (release = resolve)));
    const { app } = await appWith({ llm: slow });
    const pr = await newPr();

    const first = post(app, pr.id);
    await slow.started;
    const second = post(app, pr.id);
    // Let the second request reach the in-flight check before the first call answers.
    await sleep(200);
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(b.json()).toEqual(a.json());
    expect(completeCalls(slow)).toHaveLength(1);
    expect(await rowsFor(pr.id)).toHaveLength(1);
  });

  it('an unparseable stored row reads as { brief: null } and the next POST replaces it', async () => {
    const { app, llm } = await appWith();
    const pr = await newPr();
    await pg.handle.db.insert(t.prBrief).values({ prId: pr.id, json: { summary: 42, risks: 'nope' } });

    const read = await get(app, pr.id);
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ brief: null });
    expect(completeCalls(llm)).toEqual([]);

    const posted = await post(app, pr.id);
    expect(posted.statusCode).toBe(200);
    expect(await rowsFor(pr.id)).toHaveLength(1);
    expect((await get(app, pr.id)).json()).toEqual(posted.json());
  });

  it('generates a brief for a merged pull request', async () => {
    const { app } = await appWith();
    const pr = await newPr({ status: 'merged' });

    const res = await post(app, pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().brief).toMatchObject({ pr_id: pr.id, head_sha: HEAD });
  });

  it("sends only the findings of the newest review whose run is done: a newer running run, a newer failed run, a summary review and a review with no run are skipped", async () => {
    const { app, llm } = await appWith();
    const pr = await newPr();
    const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

    async function review(o: {
      kind: 'review' | 'summary';
      runStatus: 'done' | 'running' | 'failed' | null;
      createdAt: Date;
      tag: string;
    }) {
      let runId: string | null = null;
      if (o.runStatus !== null) {
        const [run] = await pg.handle.db
          .insert(t.agentRuns)
          .values({ workspaceId, prId: pr.id, status: o.runStatus })
          .returning();
        runId = run!.id;
      }
      const [row] = await pg.handle.db
        .insert(t.reviews)
        .values({ workspaceId, prId: pr.id, runId, kind: o.kind, createdAt: o.createdAt })
        .returning();
      await pg.handle.db.insert(t.findings).values([
        {
          reviewId: row!.id,
          file: 'src/config.ts',
          startLine: 12,
          endLine: 12,
          severity: 'CRITICAL',
          category: 'security',
          title: `${o.tag} kept`,
          rationale: 'r',
          confidence: 0.9,
        },
        {
          reviewId: row!.id,
          file: 'src/config.ts',
          startLine: 14,
          endLine: 14,
          severity: 'WARNING',
          category: 'bug',
          title: `${o.tag} dismissed`,
          rationale: 'r',
          confidence: 0.9,
          dismissedAt: new Date(),
        },
      ]);
    }

    await review({ kind: 'review', runStatus: 'done', createdAt: minutesAgo(50), tag: 'OLDDONE' });
    await review({ kind: 'review', runStatus: 'running', createdAt: minutesAgo(40), tag: 'NEWRUNNING' });
    await review({ kind: 'review', runStatus: 'failed', createdAt: minutesAgo(30), tag: 'NEWESTFAILED' });
    await review({ kind: 'summary', runStatus: 'done', createdAt: minutesAgo(20), tag: 'SUMMARYKIND' });
    await review({ kind: 'review', runStatus: null, createdAt: minutesAgo(10), tag: 'NORUN' });

    expect((await post(app, pr.id)).statusCode).toBe(200);
    const [req] = completeCalls(llm);
    const prompt = req!.messages.map((m) => m.content).join('\n');
    expect(prompt).toContain('src/config.ts:12 CRITICAL OLDDONE kept');
    for (const absent of ['OLDDONE dismissed', 'NEWRUNNING', 'NEWESTFAILED', 'SUMMARYKIND', 'NORUN']) {
      expect(prompt).not.toContain(absent);
    }
  });
});
