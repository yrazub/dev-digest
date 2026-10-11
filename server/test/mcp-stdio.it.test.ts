/**
 * L04 — the `devdigest-mcp` stdio server against a REAL API and a seeded Postgres.
 *
 * The Fastify app is built with the usual mock adapters and listens on 127.0.0.1:0. The MCP server
 * is spawned exactly as the root `.mcp.json` says (`node mcp/bin/devdigest-mcp.mjs`, from the
 * repository root) with `DEVDIGEST_API_URL` pointing at that address, and driven over its stdin and
 * stdout with the newline-delimited JSON-RPC client in `helpers/mcp-stdio.ts` (no MCP SDK in `server/`).
 *
 * Docker-gated like the other integration tests. When `mcp/node_modules` is missing the test FAILS
 * with the command to run (`cd mcp && npm ci`); it never skips for that reason (decision D24).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { assertMcpInstalled, startMcpServer, type McpProcess } from './helpers/mcp-stdio.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { BlastRadiusResponse, Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[mcp-stdio] Docker not available — skipping the devdigest-mcp integration test.');
}

// The review the mock model returns for the run started through the MCP server (as in reviews.it.test.ts):
// one finding on a line the diff touches, one on a line it does not, which grounding drops.
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

const SEEDED_AGENTS = [
  'API Contract Reviewer',
  'General Reviewer',
  'Performance Reviewer',
  'Security Reviewer',
  'Test Quality Reviewer',
];

d('devdigest-mcp over stdio against the real API (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let mcp: McpProcess;
  let runsBefore: number;
  /** The text of every tool result, so one test can check them all. */
  const resultTexts: string[] = [];

  const agentRunCount = async (): Promise<number> => {
    const rows = await pg.handle.sql<{ count: number }[]>`SELECT count(*)::int AS count FROM agent_runs`;
    return rows[0]!.count;
  };

  async function call(name: string, args: Record<string, unknown>, opts?: { progressToken?: string | number }) {
    const result = await mcp.callTool(name, args, opts);
    resultTexts.push(result.text);
    return result;
  }

  beforeAll(async () => {
    // First, so a missing install fails fast with the command to run, before a container starts.
    assertMcpInstalled();

    pg = await startPg();
    await seed(pg.handle.db);

    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient({ pulls: [] }),
        // The run started by run_agent_on_pr below reads this diff and gets REVIEW_FIXTURE from the mock model.
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });

    runsBefore = await agentRunCount();
    mcp = await startMcpServer({ apiUrl: address });
    await mcp.initialize();
  });

  afterAll(async () => {
    // Stop the spawned server first: it must never outlive the test, whatever failed before.
    await mcp?.stop();
    await app?.close();
    await pg?.stop();
  });

  it('is spawned from .mcp.json and lists exactly the five tools in their final order', async () => {
    const tools = await mcp.listTools();

    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(['list_agents', 'run_agent_on_pr', 'get_findings', 'get_conventions', 'get_blast_radius']);
  });

  it('list_agents returns the five seeded agent names and no system prompt', async () => {
    const result = await call('list_agents', {});

    expect(result.isError).toBe(false);
    const { agents } = JSON.parse(result.text) as { agents: Array<{ id: string; name: string; model: string; enabled: boolean }> };
    expect(agents.map((a) => a.name)).toEqual(SEEDED_AGENTS);
    for (const agent of agents) {
      expect(agent.id).toEqual(expect.any(String));
      expect(agent.model).toMatch(/^[a-z]+\/.+/);
    }
    expect(result.text).not.toContain('You are');
    expect(result.text).not.toContain('system_prompt');
  });

  it('get_findings for acme/payments-api #482 returns the seeded review, the critical finding first', async () => {
    const result = await call('get_findings', { repo: 'acme/payments-api', pr: 482 });

    expect(result.isError).toBe(false);
    const body = JSON.parse(result.text);
    expect(body.status).toBe('done');
    expect(body.verdict).toBe('request_changes');
    expect(body.counts).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });
    expect(body.findings).toHaveLength(2);
    expect(body.findings[0]).toMatchObject({
      severity: 'CRITICAL',
      title: 'Hardcoded Stripe secret key in commit',
      file: 'src/config.ts',
      line: 12,
    });
    expect(body.findings[1]).toMatchObject({ severity: 'WARNING', title: 'N+1 query in user list endpoint', line: 45, end_line: 52 });
    expect(body).not.toHaveProperty('truncated');
    // Nothing of the API's record beyond the review result of the spec.
    expect(Object.keys(body).sort()).toEqual(
      ['agent', 'counts', 'findings', 'reviewed_at', 'run_id', 'score', 'status', 'summary', 'verdict'],
    );
    expect(result.text).not.toContain('suggestion');
  });

  it('get_findings with min_severity CRITICAL returns one finding, and the counts still cover all', async () => {
    const result = await call('get_findings', { repo: 'acme/payments-api', pr: 482, min_severity: 'CRITICAL' });

    const body = JSON.parse(result.text);
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0].severity).toBe('CRITICAL');
    expect(body.counts).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });
  });

  it('get_findings with the run_id of that review returns the same review', async () => {
    const latest = JSON.parse((await call('get_findings', { repo: 'acme/payments-api', pr: 482 })).text);
    expect(latest.run_id).toEqual(expect.any(String));

    const byRun = JSON.parse((await call('get_findings', { repo: 'acme/payments-api', pr: 482, run_id: latest.run_id })).text);

    expect(byRun).toEqual(latest);
  });

  it('get_conventions for the seeded repo returns no accepted rules and a note that counts the 3 pending ones', async () => {
    const result = await call('get_conventions', { repo: 'acme/payments-api' });

    expect(result.isError).toBe(false);
    const body = JSON.parse(result.text);
    expect(body.repo).toBe('acme/payments-api');
    expect(body.status).toBe('accepted');
    expect(body.conventions).toEqual([]);
    expect(body.note).toContain('3 candidates');
    expect(body.note).toContain('status "pending"');
  });

  it('get_conventions with status "pending" returns the three seeded rules with their evidence', async () => {
    const result = await call('get_conventions', { repo: 'acme/payments-api', status: 'pending' });

    const body = JSON.parse(result.text);
    expect(body.status).toBe('pending');
    expect(body.conventions).toHaveLength(3);
    expect(body.conventions.map((c: { evidence: string }) => c.evidence).sort()).toEqual([
      'src/api/public/webhooks.ts:3',
      'src/config.ts:12',
      'src/middleware/ratelimit.ts:18',
    ]);
    expect(body).not.toHaveProperty('note');
  });

  it('answers an unknown repository with E-REPO-UNKNOWN naming the imported acme/payments-api', async () => {
    const result = await call('get_findings', { repo: 'acme/does-not-exist', pr: 482 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('is not imported into DevDigest');
    expect(result.text).toContain('acme/payments-api');
  });

  it('answers PR 9999 with E-PR-UNKNOWN naming #482', async () => {
    const result = await call('get_findings', { repo: 'acme/payments-api', pr: 9999 });

    expect(result.isError).toBe(true);
    expect(result.text).toContain('Pull request #9999 is not imported for acme/payments-api');
    expect(result.text).toContain('#482');
  });

  it('get_blast_radius for acme/payments-api #482 is not an error and equals GET /pulls/:id/blast in totals, summary and first group (A7)', async () => {
    // The map is read through the blast route only: `GET /pulls/:id` would replace the seeded `pr_files`
    // with the GitHub double's, so this test never calls it.
    const [pr] = await pg.handle.db.select().from(t.pullRequests).where(eq(t.pullRequests.number, 482));
    const route = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}/blast` });
    expect(route.statusCode).toBe(200);
    const map = route.json() as BlastRadiusResponse;
    expect(map.degraded).toBe(false);
    expect(map.downstream.length).toBeGreaterThan(0); // the comparison below is not vacuous
    const first = map.downstream[0]!;

    const result = await call('get_blast_radius', { repo: 'acme/payments-api', pr: 482 });

    expect(result.isError).toBe(false);
    const body = JSON.parse(result.text);
    expect(body.repo).toBe('acme/payments-api');
    expect(body.pr).toBe(482);
    expect(body.totals).toEqual(map.totals);
    expect(body.summary).toBe(map.summary);
    expect(body.impact[0]).toMatchObject({
      symbol: first.symbol,
      callers: first.callers.map((c) => `${c.file}:${c.line} ${c.name}`),
      endpoints: first.endpoints_affected,
    });
    expect(body.impact).toHaveLength(map.downstream.length);
    expect(body).not.toHaveProperty('degraded');
  });

  it('wrote only JSON-RPC messages to stdout, and reported itself ready on stderr', () => {
    expect(mcp.stdoutLines.length).toBeGreaterThan(0);
    expect(mcp.invalidLines).toEqual([]);
    expect(mcp.stderr()).toContain('devdigest-mcp ready');
  });

  it('left the database as it found it: the read tools started no run (L3)', async () => {
    expect(await agentRunCount()).toBe(runsBefore);
    for (const text of resultTexts) expect(text).not.toContain('You are');
  });

  // ---- The write tool. These run after the read-only checks above, which count agent_runs rows. ----

  describe('run_agent_on_pr (the one write tool)', () => {
    const AGENT_NAME = 'MCP Write Reviewer';
    const REPO_NAME = 'mcp-write-api';
    const FULL_NAME = `acme/${REPO_NAME}`;
    let prId: string;
    let started: { body: any } | undefined;

    const runsForPr = async (): Promise<number> => {
      const rows = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
      return rows.length;
    };

    beforeAll(async () => {
      const [ws] = await pg.handle.db.select().from(t.workspaces);
      const [repo] = await pg.handle.db
        .insert(t.repos)
        .values({ workspaceId: ws!.id, owner: 'acme', name: REPO_NAME, fullName: FULL_NAME })
        .returning();
      const [pr] = await pg.handle.db
        .insert(t.pullRequests)
        .values({
          workspaceId: ws!.id,
          repoId: repo!.id,
          number: 482,
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
      prId = pr!.id;
      await pg.handle.db.insert(t.prFiles).values({
        prId,
        path: 'src/config.ts',
        additions: 1,
        deletions: 0,
        patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
      });

      const created = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: AGENT_NAME, provider: 'openai', model: 'gpt-4.1', system_prompt: 'You review security.' },
      });
      expect(created.statusCode).toBe(201);
    });

    it('called with the agent NAME runs it and returns done, the fixture verdict and the one grounded finding, with no other tool called first', async () => {
      expect(await runsForPr()).toBe(0);
      const toolsBefore = mcp.calledTools.length;

      const result = await call('run_agent_on_pr', { repo: FULL_NAME, pr: 482, agent: AGENT_NAME }, { progressToken: 'write-1' });

      expect(result.isError).toBe(false);
      const body = JSON.parse(result.text);
      started = { body };
      expect(mcp.calledTools.slice(toolsBefore)).toEqual(['run_agent_on_pr']);
      expect(body.status).toBe('done');
      expect(body.agent).toBe(AGENT_NAME);
      expect(body.verdict).toBe('request_changes');
      expect(body.counts).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
      // Grounding dropped the finding on line 999; exactly the one on the diff's line 11 is left.
      expect(body.findings).toHaveLength(1);
      expect(body.findings[0]).toMatchObject({
        severity: 'CRITICAL',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        line: 11,
      });
      expect(body).not.toHaveProperty('attached');
      expect(result.text).not.toContain('You are');
    });

    it('left exactly one agent_runs row for that pull request', async () => {
      expect(started).toBeDefined();

      expect(await runsForPr()).toBe(1);
    });

    it('get_findings with the returned run_id returns the same review', async () => {
      const body = started?.body;
      expect(body?.run_id).toEqual(expect.any(String));

      const again = JSON.parse((await call('get_findings', { repo: FULL_NAME, pr: 482, run_id: body.run_id })).text);

      expect(again.findings).toEqual(body.findings);
      expect(again).toEqual(body);
      expect(await runsForPr()).toBe(1);
    });

    it('sent at least one notifications/progress for the progress token of that call', () => {
      const progress = mcp.notifications.filter(
        (n) => n.method === 'notifications/progress' && (n as any).params?.progressToken === 'write-1',
      );

      expect(progress.length).toBeGreaterThanOrEqual(1);
      expect((progress[0] as any).params.progress).toEqual(expect.any(Number));
    });

    it('answers an unknown agent with E-AGENT-UNKNOWN naming list_agents and creates no agent_runs row', async () => {
      const totalBefore = await agentRunCount();

      const result = await call('run_agent_on_pr', { repo: FULL_NAME, pr: 482, agent: 'No Such Agent' });

      expect(result.isError).toBe(true);
      expect(result.text).toContain('Agent "No Such Agent" was not found');
      expect(result.text).toContain('Call list_agents');
      expect(await agentRunCount()).toBe(totalBefore);
    });

    it('answers an unknown repository and an unknown PR without creating a run', async () => {
      const totalBefore = await agentRunCount();

      const repo = await call('run_agent_on_pr', { repo: 'acme/does-not-exist', pr: 482, agent: AGENT_NAME });
      const pr = await call('run_agent_on_pr', { repo: FULL_NAME, pr: 9999, agent: AGENT_NAME });

      expect(repo.isError).toBe(true);
      expect(repo.text).toContain('is not imported into DevDigest');
      expect(pr.isError).toBe(true);
      expect(pr.text).toContain('Pull request #9999 is not imported');
      expect(await agentRunCount()).toBe(totalBefore);
    });

    it('still wrote only JSON-RPC messages to stdout after the write', () => {
      expect(mcp.invalidLines).toEqual([]);
    });
  });
});
