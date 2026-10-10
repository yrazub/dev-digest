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

  it('answers tools/call get_blast_radius with isError and "not implemented"', async () => {
    const result = await server.client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/payments-api', pr: 7 } });

    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe('text');
    expect(content[0]?.text).toContain('not implemented');
    expect(content[0]?.text).toContain('Do not estimate or invent it');
    expect(result).not.toHaveProperty('structuredContent');
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

  it('answers a repository the stub does not know with isError (the API said 404), not by crashing', async () => {
    const result = await server.client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/payments-api' } });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? '';
    expect(text).toContain('The DevDigest API answered 404');
    expect(text).toContain('GET /repos');
    expect(isAlive(server.pid)).toBe(true);
    expect(requests.every((r) => r.method === 'GET')).toBe(true);
  });
});
