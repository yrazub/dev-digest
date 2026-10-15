import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SERVER_INSTRUCTIONS } from '../src/constants.js';
import { isAlive, readMcpJsonEntry, startServer, waitFor, type RunningServer } from './helpers/stdio-server.js';

// A spawned server must never outlive its test: every started server is stopped in a hook.
const running: RunningServer[] = [];

async function stopAll(): Promise<void> {
  await Promise.all(running.splice(0).map((server) => server.stop()));
}

async function start(opts: { apiUrl?: string } = {}): Promise<RunningServer> {
  const server = await startServer(opts);
  running.push(server);
  return server;
}

describe('the .mcp.json entry', () => {
  it('is node with the single relative argument mcp/bin/devdigest-mcp.mjs', () => {
    const entry = readMcpJsonEntry();

    expect(entry.command).toBe('node');
    expect(entry.args).toEqual(['mcp/bin/devdigest-mcp.mjs']);
  });

  it('holds no absolute path and no environment name containing KEY, TOKEN or SECRET', () => {
    const entry = readMcpJsonEntry();

    for (const arg of [entry.command, ...entry.args]) {
      expect(arg).not.toMatch(/^([/\\]|[A-Za-z]:[/\\])/);
      expect(arg).not.toContain('/Users/');
    }
    for (const name of Object.keys(entry.env ?? {})) {
      expect(name.toUpperCase()).not.toMatch(/KEY|TOKEN|SECRET/);
    }
  });
});

describe('devdigest-mcp over stdio, started as .mcp.json starts it', () => {
  let server: RunningServer;

  beforeAll(async () => {
    server = await start();
  });

  afterAll(stopAll);

  it('answers initialize with its name and the shipped instructions', () => {
    expect(server.client.getServerVersion()?.name).toBe('devdigest-mcp');
    expect(server.client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
  });

  it('lists get_blast_radius as read-only, with repo and pr and no outputSchema', async () => {
    const { tools } = await server.client.listTools();

    const tool = tools.find((t) => t.name === 'get_blast_radius');
    expect(tool).toBeDefined();
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?.outputSchema).toBeUndefined();
    const schema = tool?.inputSchema as { properties?: Record<string, { type?: string }>; additionalProperties?: boolean };
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual(['pr', 'repo']);
    expect(schema.properties?.repo?.type).toBe('string');
    expect(schema.properties?.pr?.type).toBe('integer');
    expect(schema.additionalProperties).toBe(false);
  });

  it('lists get_blast_radius with the description the mcp spec fixes, and the instructions point at it (B8)', async () => {
    const { tools } = await server.client.listTools();

    expect(tools.find((t) => t.name === 'get_blast_radius')?.description).toBe(
      'Impact map of a pull request: the symbols declared in its changed files, who calls them (file:line) and the HTTP endpoints and cron jobs in those callers. Call it to see what a change can break. Reads a ready index; no LLM call.',
    );
    expect(server.client.getInstructions()).toContain("For what a PR's changes can reach, call get_blast_radius.");
  });

  it('answers an invalid call with isError and the tool name, not with data and not by crashing', async () => {
    const result = await server.client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/payments-api', pr: 0 } });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain('get_blast_radius');
    expect(content[0]?.text).not.toContain('not implemented');
    expect(isAlive(server.pid)).toBe(true);
  });

  it('answers an unknown key with isError as well (the registered schema is strict)', async () => {
    const result = await server.client.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'acme/payments-api', pr: 7, extra: 1 },
    });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).not.toContain('not implemented');
  });

  it('lists the three read tools as read-only with their flat schemas and no outputSchema', async () => {
    const { tools } = await server.client.listTools();

    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const name of ['list_agents', 'get_findings', 'get_conventions']) {
      const tool = byName.get(name);
      expect(tool, name).toBeDefined();
      expect(tool?.annotations?.readOnlyHint, name).toBe(true);
      expect(tool?.outputSchema, name).toBeUndefined();
      expect((tool?.inputSchema as { additionalProperties?: boolean }).additionalProperties, name).toBe(false);
    }
    expect(Object.keys((byName.get('list_agents')?.inputSchema as { properties?: object }).properties ?? {})).toEqual([]);
    const findings = byName.get('get_findings')?.inputSchema as {
      required?: string[];
      properties: Record<string, { type?: string; enum?: string[] }>;
    };
    expect(findings.required?.slice().sort()).toEqual(['pr', 'repo']);
    expect(Object.keys(findings.properties).sort()).toEqual(['limit', 'min_severity', 'pr', 'repo', 'run_id']);
    expect(findings.properties.pr?.type).toBe('integer');
    expect(findings.properties.min_severity?.enum).toEqual(['CRITICAL', 'WARNING', 'SUGGESTION']);
    const conventions = byName.get('get_conventions')?.inputSchema as { properties: Record<string, { enum?: string[] }> };
    expect(conventions.properties.status?.enum).toEqual(['pending', 'accepted']);
  });

  it('list_agents against a closed port answers isError with E-API-UNREACHABLE naming the URL and ./scripts/dev.sh', async () => {
    const result = await server.client.callTool({ name: 'list_agents', arguments: {} });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0]?.text).toMatch(/not reachable at http:\/\/127\.0\.0\.1:\d+/);
    expect(content[0]?.text).toContain('./scripts/dev.sh');
    expect(isAlive(server.pid)).toBe(true);
  });

  it('reported no transport or parse error during the session, and stderr got the ready line', async () => {
    const ready = await waitFor(() => server.stderr().includes('devdigest-mcp ready'), 2_000);

    expect(ready).toBe(true);
    expect(server.stderr()).toMatch(/devdigest-mcp ready \(API http:\/\/127\.0\.0\.1:\d+\)/);
    expect(server.errors.map((e) => e.message)).toEqual([]);
  });
});

interface ListedSchema {
  type?: string;
  properties?: Record<string, { type?: string; enum?: unknown[]; description?: string; minimum?: number }>;
  required?: string[];
  additionalProperties?: boolean;
}

describe('the whole server: five tools, their budget and their shape', () => {
  const FINAL_ORDER = ['list_agents', 'run_agent_on_pr', 'get_findings', 'get_conventions', 'get_blast_radius'];
  const DESCRIBED = ['repo', 'pr', 'agent', 'run_id'];
  let server: RunningServer;
  let listed: Awaited<ReturnType<RunningServer['client']['listTools']>>;

  beforeAll(async () => {
    server = await start();
    listed = await server.client.listTools();
  });

  afterAll(stopAll);

  const schemaOf = (name: string): ListedSchema => {
    const tool = listed.tools.find((t) => t.name === name);
    expect(tool, name).toBeDefined();
    return tool?.inputSchema as ListedSchema;
  };

  it('lists exactly the five tools in the final order, and neither list_prs nor list_repos', () => {
    const names = listed.tools.map((t) => t.name);

    expect(names).toEqual(FINAL_ORDER);
    expect(names).not.toContain('list_prs');
    expect(names).not.toContain('list_repos');
  });

  it('keeps the startup payload small: tools/list at most 4,000 characters, the instructions at most 500', () => {
    expect(JSON.stringify(listed).length).toBeLessThanOrEqual(4_000);
    const instructions = server.client.getInstructions() ?? '';
    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions.length).toBeLessThanOrEqual(500);
  });

  it('gives every tool a description of at most 240 characters with no JSON in it', () => {
    for (const tool of listed.tools) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.description?.length, tool.name).toBeLessThanOrEqual(240);
      expect(tool.description, tool.name).not.toContain('{');
    }
  });

  it('does not tell the caller to call list_agents first, in its description or in the instructions', () => {
    const description = listed.tools.find((t) => t.name === 'list_agents')?.description ?? '';

    expect(description).not.toContain('first');
    expect(description).toBe(
      "List the reviewer agents configured in DevDigest. Call it when you need an agent's id or exact name for run_agent_on_pr.",
    );
    // The instructions make the lookup conditional ("only when you do not know ..."), never a fixed first step.
    const instructions = server.client.getInstructions() ?? '';
    expect(instructions).toContain('Call list_agents first only when you do not know');
    expect(instructions).not.toMatch(/always/i);
  });

  it('lists no outputSchema on any tool', () => {
    for (const tool of listed.tools) expect(tool.outputSchema, tool.name).toBeUndefined();
  });

  it('keeps every input property flat: a string, integer, number, boolean or enum, never an object or array', () => {
    for (const tool of listed.tools) {
      const properties = (tool.inputSchema as ListedSchema).properties ?? {};
      for (const [name, property] of Object.entries(properties)) {
        const flat = property.enum !== undefined || ['string', 'integer', 'number', 'boolean'].includes(property.type ?? '');
        expect(flat, `${tool.name}.${name}`).toBe(true);
        expect(property.type, `${tool.name}.${name}`).not.toBe('object');
        expect(property.type, `${tool.name}.${name}`).not.toBe('array');
      }
    }
  });

  it('gives list_agents an empty, closed schema: no properties, nothing required, additionalProperties false', () => {
    const schema = schemaOf('list_agents');

    expect(schema.type).toBe('object');
    expect(Object.keys(schema.properties ?? {})).toEqual([]);
    expect(schema.required ?? []).toEqual([]);
    expect(schema.additionalProperties).toBe(false);
  });

  it('lists run_agent_on_pr with repo, pr and agent required, and the shared parameter names', () => {
    const schema = schemaOf('run_agent_on_pr');

    expect(Object.keys(schema.properties ?? {}).sort()).toEqual(['agent', 'pr', 'repo']);
    expect(schema.required?.slice().sort()).toEqual(['agent', 'pr', 'repo']);
    expect(schema.properties?.repo?.type).toBe('string');
    expect(schema.properties?.pr?.type).toBe('integer');
    expect(schema.properties?.pr?.minimum).toBe(1);
    expect(schema.properties?.agent?.type).toBe('string');
    expect(schema.additionalProperties).toBe(false);
    // The same names recur wherever the same thing is meant.
    expect(Object.keys(schemaOf('get_findings').properties ?? {})).toEqual(expect.arrayContaining(['repo', 'pr', 'run_id']));
  });

  it('describes the agent parameter as "agent id or exact name"', () => {
    expect(schemaOf('run_agent_on_pr').properties?.agent?.description).toBe('agent id or exact name');
  });

  it('puts a description on repo, pr, agent and run_id only', () => {
    const described = new Set<string>();
    for (const tool of listed.tools) {
      for (const [name, property] of Object.entries((tool.inputSchema as ListedSchema).properties ?? {})) {
        if (property.description !== undefined) {
          described.add(name);
          expect(DESCRIBED, `${tool.name}.${name} carries a description`).toContain(name);
        } else {
          expect(DESCRIBED, `${tool.name}.${name} has none`).not.toContain(name);
        }
      }
    }
    expect([...described].sort()).toEqual([...DESCRIBED].sort());
  });

  it('marks four tools readOnlyHint true and run_agent_on_pr readOnlyHint false, destructive false, open-world true', () => {
    for (const tool of listed.tools) {
      if (tool.name === 'run_agent_on_pr') {
        expect(tool.annotations?.readOnlyHint, tool.name).toBe(false);
        expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
        expect(tool.annotations?.openWorldHint, tool.name).toBe(true);
      } else {
        expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      }
    }
    expect(listed.tools.filter((t) => t.annotations?.readOnlyHint === true)).toHaveLength(4);
  });

  it('describes run_agent_on_pr as the paid call and points at get_findings for an existing review', () => {
    const description = listed.tools.find((t) => t.name === 'run_agent_on_pr')?.description ?? '';

    expect(description).toContain('paid LLM run');
    expect(description).toContain('get_findings');
  });

  it('answers run_agent_on_pr against a closed port with isError E-API-UNREACHABLE, started nothing and alive', async () => {
    const result = await server.client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: 'acme/payments-api', pr: 482, agent: 'Security Reviewer' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
    expect(text).toMatch(/not reachable at http:\/\/127\.0\.0\.1:\d+/);
    expect(text).toContain('./scripts/dev.sh');
    expect(isAlive(server.pid)).toBe(true);
  });
});

describe('shutdown', () => {
  afterEach(stopAll);

  it('ends the process within 2 s after the client disconnects', async () => {
    const server = await start();
    const { pid } = server;
    expect(isAlive(pid)).toBe(true);

    const startedAt = Date.now();
    await server.client.close();
    const gone = await waitFor(() => !isAlive(pid), 2_000 - (Date.now() - startedAt));

    expect(gone).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(server.errors.map((e) => e.message)).toEqual([]);
  });
});

const STUB_REPO = {
  id: 'repo-1',
  workspace_id: 'ws-1',
  owner: 'acme',
  name: 'payments-api',
  full_name: 'acme/payments-api',
  default_branch: 'main',
  clone_path: '/some/where',
  last_polled_at: null,
  created_by: null,
};

const STUB_BLAST = {
  changed_symbols: [
    { name: 'rateLimit', file: 'src/middleware/ratelimit.ts', kind: 'function' },
    { name: 'unused', file: 'src/util.ts', kind: 'function' },
  ],
  downstream: [
    {
      symbol: 'rateLimit',
      callers: [{ name: 'publicRouter', file: 'src/api/public/index.ts', line: 23 }],
      endpoints_affected: ['GET /api/public/items'],
      crons_affected: [],
    },
  ],
  summary: '2 changed symbols, 1 caller, 1 endpoint, 0 cron jobs.',
  totals: { symbols: 2, callers: 1, endpoints: 1, crons: 0, symbols_without_callers: 1 },
  degraded: false,
  reason: null,
  indexed_sha: 'abc123',
  caller_limit: 20,
};

describe('devdigest-mcp over stdio against a local API stub', () => {
  const SYSTEM_PROMPT = `You are a ruthless reviewer. ${'X'.repeat(5_000)}`;
  const requests: Array<{ method?: string; url?: string }> = [];
  let stub: http.Server;
  let server: RunningServer;

  beforeAll(async () => {
    stub = http.createServer((req, res) => {
      requests.push({ method: req.method, url: req.url });
      if (req.method === 'GET' && req.url === '/agents') {
        const agent = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
          id,
          name,
          description: `${name} description`,
          provider: 'openai',
          model: 'gpt-4.1',
          system_prompt: 'short prompt',
          enabled: true,
          version: 1,
          strategy: 'single-pass',
          ci_fail_on: 'critical',
          repo_intel: true,
          skill_count: 0,
          ...extra,
        });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify([
            agent('agent-security', 'Security Reviewer', { system_prompt: SYSTEM_PROMPT }),
            agent('agent-general', 'General Reviewer'),
          ]),
        );
        return;
      }
      if (req.method === 'GET' && req.url === '/repos') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify([STUB_REPO]));
        return;
      }
      if (req.method === 'GET' && req.url === '/repos/repo-1/pulls') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify([{ id: 'pr-482', number: 482, title: 'Add rate limiting', author: 'sam', status: 'open' }]));
        return;
      }
      if (req.method === 'GET' && req.url === '/pulls/pr-482/blast') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(STUB_BLAST));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'not_found', message: 'no such route' } }));
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const { port } = stub.address() as AddressInfo;
    server = await start({ apiUrl: `http://127.0.0.1:${port}` });
  });

  afterAll(async () => {
    await stopAll();
    await new Promise<void>((resolve) => {
      stub.close(() => resolve());
      stub.closeAllConnections();
    });
  });

  it('list_agents returns both ids and names and never the system prompt', async () => {
    const result = await server.client.callTool({ name: 'list_agents', arguments: {} });

    expect(result.isError).toBeUndefined();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    const text = content[0]?.text ?? '';
    const agents = (JSON.parse(text) as { agents: Array<{ id: string; name: string }> }).agents;
    expect(agents.map((a) => [a.id, a.name])).toEqual([
      ['agent-general', 'General Reviewer'],
      ['agent-security', 'Security Reviewer'],
    ]);
    expect(text).not.toContain('You are a ruthless reviewer');
    expect(text).not.toContain('system_prompt');
    expect(text.length).toBeLessThan(1_000);
  });

  it('asked the stub for GET requests only', () => {
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.map((r) => r.method)).toEqual(requests.map(() => 'GET'));
    expect(requests.map((r) => r.url)).toContain('/agents');
  });

  it('answers tools/call get_blast_radius with the compact map and no error, after three GETs and no write', async () => {
    requests.length = 0;

    const result = await server.client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/payments-api', pr: 482 } });

    expect(result.isError).toBeUndefined();
    expect(result).not.toHaveProperty('structuredContent');
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe('text');
    const view = JSON.parse(content[0]?.text ?? 'null') as Record<string, unknown>;
    expect(view).toEqual({
      repo: 'acme/payments-api',
      pr: 482,
      summary: '2 changed symbols, 1 caller, 1 endpoint, 0 cron jobs.',
      totals: { symbols: 2, callers: 1, endpoints: 1, crons: 0 },
      impact: [
        {
          symbol: 'rateLimit',
          declared_in: 'src/middleware/ratelimit.ts',
          callers: ['src/api/public/index.ts:23 publicRouter'],
          endpoints: ['GET /api/public/items'],
          crons: [],
        },
      ],
      symbols_without_callers: 1,
    });
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /repos',
      'GET /repos/repo-1/pulls',
      'GET /pulls/pr-482/blast',
    ]);
  });

  it('answers a route the stub does not serve with isError (the API said 404), not by crashing', async () => {
    const result = await server.client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/payments-api' } });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
    expect(text).toContain('The DevDigest API answered 404');
    expect(text).toContain('GET /repos/:id/conventions');
    expect(isAlive(server.pid)).toBe(true);
    expect(requests.every((r) => r.method === 'GET')).toBe(true);
  });
});
