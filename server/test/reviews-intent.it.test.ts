/**
 * L03 phase 6 — the derived intent in a review run, through `POST /pulls/:id/review` against a
 * real Postgres and the built app. The outside world is replaced through `overrides`: an empty
 * `MockSecretsProvider` (so `~/.devdigest/secrets.json` is never read), `MockGitHubClient`,
 * `MockGitClient`, and two `MockLLMProvider`s — `openrouter` is the classifier's provider and
 * also serves the seeded agents, `openai` serves the agent created here. Each mock answers
 * `completeStructured` by `schemaName` (`IntentClassification`, `Review`), so the two calls of a
 * run are told apart. No key, no network.
 * Spec: `server/specs/L03-intent-layer.md`; plan: `specs/L03-intent-layer-plan.md` (phase 6).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Finding, Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  MockSecretsProvider,
  type MockGitHubOptions,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;
const HUNK_HEADER = '@@ -10,3 +10,4 @@';

/** The classifier's model is the `review_intent` feature model; the agent's own model is a different one (R5, R9). */
const CLASSIFIER_PROVIDER = 'openrouter';
const CLASSIFIER_MODEL = 'deepseek/deepseek-v4-flash';
const AGENT_PROVIDER = 'openai';
const AGENT_MODEL = 'gpt-4.1';

/** At least 80 characters and no reference of any kind in it: a `medium` base tier. */
const PLAIN_BODY =
  'Adds a token-bucket limiter to the public API and returns 429 with Retry-After when a client exceeds its quota.';
const SECRET_NOTE = 'zanzibarquokka';

const CLASSIFICATION = {
  summary: 'Adds a token-bucket rate limiter to the public API.',
  in_scope: ['Token-bucket limiter', 'Return 429 with Retry-After'],
  out_of_scope: ['Per-user limits'],
  risk_areas: [{ kind: 'api', label: 'Public API behaviour changes' }],
  basis: 'stated',
  injection_suspected: false,
};

const finding = (over: Partial<Finding> & Pick<Finding, 'id' | 'severity' | 'title' | 'start_line'>): Finding => ({
  category: 'bug',
  file: 'src/config.ts',
  end_line: over.start_line,
  rationale: 'Because.',
  confidence: 0.9,
  kind: 'finding',
  ...over,
});

/** An in-scope WARNING, an out-of-scope SUGGESTION and an out-of-scope CRITICAL, all on lines of the diff. */
const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'Three findings.',
  score: 10,
  findings: [
    finding({ id: 'f-warn', severity: 'WARNING', title: 'Limiter ignores clock skew', start_line: 11, scope: 'in_scope' }),
    finding({ id: 'f-sugg', severity: 'SUGGESTION', title: 'Rename helper', category: 'style', start_line: 12, scope: 'out_of_scope' }),
    finding({ id: 'f-crit', severity: 'CRITICAL', title: 'Hardcoded Stripe secret key', category: 'security', start_line: 10, scope: 'out_of_scope' }),
  ],
};

type LogLine = { t?: number; kind: string; msg: string };
type Trace = {
  config: { model: string; provider: string };
  stats: { scope_filtered?: number | null; grounding: string };
  prompt_assembly: { intent?: string | null; user: string };
  tool_calls: { tool: string; args: string; meta: string; ms: number }[];
  log: LogLine[];
};
type StructuredCall = { schemaName: string; model: string; messages: { role: string; content: string }[] };

d('L03 intent in a review run (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  const apps: FastifyInstance[] = [];

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

  /** A fresh app, mocks and PR. `body: null` is a PR with no description. */
  async function setup(
    o: { classification?: unknown; review?: Review; github?: MockGitHubOptions; body?: string | null } = {},
  ) {
    const fixtures = { IntentClassification: o.classification ?? CLASSIFICATION, Review: o.review ?? REVIEW };
    const classifierLlm = new MockLLMProvider(CLASSIFIER_PROVIDER, { structuredBySchema: fixtures });
    const agentLlm = new MockLLMProvider(AGENT_PROVIDER, { structuredBySchema: fixtures });
    const github = new MockGitHubClient(o.github);
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github,
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openrouter: classifierLlm, openai: agentLlm },
      },
    });
    apps.push(app);

    const name = `intent-run-${seq++}`;
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
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: o.body === undefined ? `${PLAIN_BODY} Internal note: ${SECRET_NOTE}.` : o.body,
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: `${HUNK_HEADER}\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,`,
    });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Intent agent ${seq}`, provider: AGENT_PROVIDER, model: AGENT_MODEL, system_prompt: 'Review.' },
      })
    ).json();
    return { app, pr: pr!, agent, classifierLlm, agentLlm, github };
  }
  type Ctx = Awaited<ReturnType<typeof setup>>;

  /** Start one agent's review and return what a user could read afterwards. */
  async function review(ctx: Ctx, opts: { expectedRuns?: number } = {}) {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/pulls/${ctx.pr.id}/review`,
      payload: { agentId: ctx.agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    const runs = await waitForPrRuns(pg.handle.db, ctx.pr.id, { expected: opts.expectedRuns ?? 1 });
    const run = runs.find((r) => r.id === runId)!;
    expect(run.status).toBe('done');
    const trace = await waitForRunTrace<Trace>(ctx.app, runId);
    const reviews = (await ctx.app.inject({ method: 'GET', url: `/pulls/${ctx.pr.id}/reviews` })).json() as {
      run_id: string;
      score: number;
      findings: { title: string; severity: string; scope: string | null }[];
    }[];
    return { runId, run, trace, review: reviews.find((r) => r.run_id === runId)! };
  }

  const structuredCalls = (llm: MockLLMProvider, schemaName: string): StructuredCall[] =>
    llm.calls
      .filter((c) => c.method === 'completeStructured')
      .map((c) => c.req as StructuredCall)
      .filter((r) => r.schemaName === schemaName);
  const userMessage = (call: StructuredCall) => call.messages.find((m) => m.role === 'user')!.content;
  const msgs = (trace: Trace) => trace.log.map((e) => e.msg);

  describe('a medium-confidence intent with an in-scope WARNING, an out-of-scope SUGGESTION and an out-of-scope CRITICAL', () => {
    let ctx: Ctx;
    let out: Awaited<ReturnType<typeof review>>;

    beforeAll(async () => {
      ctx = await setup();
      out = await review(ctx);
    });

    it('puts the intent into the Review prompt: heading, summary and provenance line', () => {
      const [call] = structuredCalls(ctx.agentLlm, 'Review');
      const user = userMessage(call!);

      expect(user).toContain('## PR intent (derived)');
      expect(user).toContain(`Summary: ${CLASSIFICATION.summary}`);
      expect(user).toContain('Confidence: medium — derived from: title, description, changed files');
    });

    it('stores the intent block in trace.prompt_assembly.intent', () => {
      expect(out.trace.prompt_assembly.intent).toContain(`Summary: ${CLASSIFICATION.summary}`);
      expect(out.trace.prompt_assembly.intent).toContain('Confidence: medium');
    });

    it('classifies with the feature model and reviews with the agent model (R5, R9)', () => {
      const classification = structuredCalls(ctx.classifierLlm, 'IntentClassification');
      const reviews = structuredCalls(ctx.agentLlm, 'Review');

      expect(classification).toHaveLength(1);
      expect(classification[0]!.model).toBe(CLASSIFIER_MODEL);
      expect(reviews).toHaveLength(1);
      expect(reviews[0]!.model).toBe(AGENT_MODEL);
      // Neither mock saw the other's call.
      expect(structuredCalls(ctx.agentLlm, 'IntentClassification')).toHaveLength(0);
      expect(structuredCalls(ctx.classifierLlm, 'Review')).toHaveLength(0);
      // The persisted trace keeps the main review's model.
      expect(out.trace.config).toMatchObject({ provider: AGENT_PROVIDER, model: AGENT_MODEL });
    });

    it('lists classify_intent first and a review_file entry after it', () => {
      expect(out.trace.tool_calls[0]).toMatchObject({
        tool: 'classify_intent',
        args: `${CLASSIFIER_PROVIDER}/${CLASSIFIER_MODEL}`,
        meta: 'computed · 100 in / 50 out tok · $0.0010',
      });
      expect(out.trace.tool_calls[1]!.tool).toBe('review_file');
    });

    it('logs the classifier call, its result and the review call, each with its own model and token counts (R9)', () => {
      const log = msgs(out.trace);
      const classifierModel = `${CLASSIFIER_PROVIDER}/${CLASSIFIER_MODEL}`;
      const reviewModel = `${AGENT_PROVIDER}/${AGENT_MODEL}`;

      expect(log).toContainEqual(expect.stringMatching(new RegExp(`^Intent classifier call → ${classifierModel} · ~\\d+ tok estimated$`)));
      expect(log).toContainEqual(
        expect.stringMatching(new RegExp(`^Intent classifier done ← ${classifierModel} · 100 in / 50 out tok · \\$0\\.0010 · 1 attempt\\(s\\) · \\d+ ms$`)),
      );
      expect(log).toContain(`Review call done ← ${reviewModel} · 100 in / 50 out tok · $0.0010 · 1 call(s)`);
      expect(log).toContainEqual(expect.stringMatching(/^Intent attached · ~\d+ tok · scope filter on$/));
      // The classifier pair is shared pre-work: it comes before the agent's own start line.
      expect(log.findIndex((m) => m.startsWith('Intent classifier done ←'))).toBeLessThan(
        log.findIndex((m) => m.startsWith('Starting review with agent')),
      );
    });

    it('never logs the description text or a hunk header (R6)', () => {
      for (const line of msgs(out.trace)) {
        expect(line).not.toContain(SECRET_NOTE);
        expect(line).not.toContain(PLAIN_BODY);
        expect(line).not.toContain('@@');
      }
    });

    it('persists the WARNING and the CRITICAL (tagged out_of_scope), not the SUGGESTION (R3)', () => {
      expect(out.review.findings.map((f) => [f.title, f.severity, f.scope]).sort()).toEqual([
        ['Hardcoded Stripe secret key', 'CRITICAL', 'out_of_scope'],
        ['Limiter ignores clock skew', 'WARNING', 'in_scope'],
      ]);
    });

    it('counts and scores the two kept findings: findings_count 2, score 100 - 35 - 12', () => {
      expect(out.run.findingsCount).toBe(2);
      expect(out.run.findingsBySeverity).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });
      expect(out.review.score).toBe(53);
    });

    it('records one filtered finding in the stats and names it in the log (R3)', () => {
      expect(out.trace.stats.scope_filtered).toBe(1);
      expect(msgs(out.trace)).toContain(
        'scope filtered "Rename helper" (SUGGESTION, src/config.ts:12): out of scope (SUGGESTION)',
      );
      expect(msgs(out.trace)).toContain('Scope filter: 1 out-of-scope finding(s) filtered · 1 signal(s) kept');
    });
  });

  it('with an empty description (a low intent) keeps all three findings and records no filtered count', async () => {
    const ctx = await setup({ body: null });
    const out = await review(ctx);

    expect(out.review.findings).toHaveLength(3);
    expect(out.run.findingsCount).toBe(3);
    expect(out.trace.stats.scope_filtered).toBeNull();
    expect(msgs(out.trace)).toContainEqual(expect.stringMatching(/^Intent attached · ~\d+ tok · scope filter off \(low confidence\)$/));
    expect(msgs(out.trace).some((m) => m.startsWith('scope filtered '))).toBe(false);
    // A low intent is still injected, so the model still tags.
    expect(userMessage(structuredCalls(ctx.agentLlm, 'Review')[0]!)).toContain('Confidence: low');
  });

  it('with injection_suspected filters nothing, even from a substantive description', async () => {
    const ctx = await setup({ classification: { ...CLASSIFICATION, injection_suspected: true } });
    const out = await review(ctx);

    expect(out.review.findings).toHaveLength(3);
    expect(out.trace.stats.scope_filtered).toBeNull();
    expect(msgs(out.trace)).toContainEqual(
      expect.stringMatching(/^Intent attached · ~\d+ tok · scope filter off \(injection suspected\)$/),
    );
    expect(userMessage(structuredCalls(ctx.agentLlm, 'Review')[0]!)).toContain('Caution:');
  });

  it('puts the Missing context line into the review prompt when a linked document cannot be read (R8)', async () => {
    const ctx = await setup({ body: 'Adds a limiter. Closes #471. Design in specs/rate-limit.md.' });
    const out = await review(ctx);

    const user = userMessage(structuredCalls(ctx.agentLlm, 'Review')[0]!);
    expect(user).toContain('Missing context: specs/rate-limit.md was referenced but could not be read');
    expect(out.trace.prompt_assembly.intent).toContain('Missing context: specs/rate-limit.md');
    // The issue was read, so it is a source; the document was not, so it is not.
    expect(user).toContain('Confidence: medium — derived from: title, description, issue #471, changed files');
    expect(ctx.github.fileRequests.length).toBeGreaterThan(0);
  });

  it('a second run on the same head logs cached and makes no second classification call', async () => {
    const ctx = await setup();
    const first = await review(ctx);
    expect(first.trace.tool_calls[0]!.meta).toMatch(/^computed · /);

    const second = await review(ctx, { expectedRuns: 2 });

    expect(structuredCalls(ctx.classifierLlm, 'IntentClassification')).toHaveLength(1);
    expect(structuredCalls(ctx.agentLlm, 'Review')).toHaveLength(2);
    expect(msgs(second.trace)).toContainEqual(
      expect.stringMatching(/^Intent: cached \(medium confidence, head a1b2c3d\) — classifier not called$/),
    );
    expect(second.trace.tool_calls[0]).toMatchObject({ tool: 'classify_intent', meta: 'cached' });
    // The cached record still reaches the prompt and still filters.
    expect(second.trace.stats.scope_filtered).toBe(1);
    expect(userMessage(structuredCalls(ctx.agentLlm, 'Review')[1]!)).toContain(`Summary: ${CLASSIFICATION.summary}`);
  });

  it('a batch of agents makes one classification call and gives every run the classifier entry', async () => {
    const ctx = await setup();
    const res = await ctx.app.inject({ method: 'POST', url: `/pulls/${ctx.pr.id}/review`, payload: { all: true } });
    expect(res.statusCode).toBe(200);
    const runIds = (res.json().runs as { run_id: string }[]).map((r) => r.run_id);
    expect(runIds.length).toBeGreaterThanOrEqual(2);
    await waitForPrRuns(pg.handle.db, ctx.pr.id, { expected: runIds.length, timeoutMs: 30_000 });

    const classification = [...structuredCalls(ctx.classifierLlm, 'IntentClassification'), ...structuredCalls(ctx.agentLlm, 'IntentClassification')];
    expect(classification).toHaveLength(1);
    for (const runId of runIds) {
      const trace = await waitForRunTrace<Trace>(ctx.app, runId);
      expect(trace.tool_calls[0]!.tool).toBe('classify_intent');
      expect(msgs(trace)).toContainEqual(expect.stringMatching(/^Intent classifier done ←/));
    }
  });

  it('a classification that fails its schema leaves the run done, with no intent section, no filtering and no error line', async () => {
    const ctx = await setup({ classification: { summary: 42 } });
    const out = await review(ctx);

    expect(userMessage(structuredCalls(ctx.agentLlm, 'Review')[0]!)).not.toContain('## PR intent (derived)');
    expect(out.trace.prompt_assembly.intent ?? null).toBeNull();
    expect(out.review.findings).toHaveLength(3);
    expect(out.trace.stats.scope_filtered).toBeNull();
    expect(out.trace.tool_calls[0]).toMatchObject({ tool: 'classify_intent', meta: 'unavailable (schema_invalid)' });
    expect(out.trace.log.filter((e) => e.kind === 'error')).toEqual([]);
    expect(msgs(out.trace)).toContain('Intent unavailable (schema_invalid) — continuing without it');
    expect(msgs(out.trace).some((m) => m.startsWith('Intent attached'))).toBe(false);
    // No row was written for the failed derivation.
    expect(await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, ctx.pr.id))).toHaveLength(0);
  });
});
