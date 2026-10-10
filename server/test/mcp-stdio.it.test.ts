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
import { MockGitHubClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[mcp-stdio] Docker not available — skipping the devdigest-mcp integration test.');
}

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

  async function call(name: string, args: Record<string, unknown>) {
    const result = await mcp.callTool(name, args);
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
        llm: { openai: new MockLLMProvider('openai') },
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

  it('is spawned from .mcp.json and lists the read tools', async () => {
    const tools = await mcp.listTools();

    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['list_agents', 'get_findings', 'get_conventions']));
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

  it('wrote only JSON-RPC messages to stdout, and reported itself ready on stderr', () => {
    expect(mcp.stdoutLines.length).toBeGreaterThan(0);
    expect(mcp.invalidLines).toEqual([]);
    expect(mcp.stderr()).toContain('devdigest-mcp ready');
  });

  it('left the database as it found it: the read tools started no run (L3)', async () => {
    expect(await agentRunCount()).toBe(runsBefore);
    for (const text of resultTexts) expect(text).not.toContain('You are');
  });
});
