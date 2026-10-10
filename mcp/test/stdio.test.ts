import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SERVER_INSTRUCTIONS } from '../src/constants.js';
import { isAlive, readMcpJsonEntry, startServer, waitFor, type RunningServer } from './helpers/stdio-server.js';

// A spawned server must never outlive its test: every started server is stopped in a hook.
const running: RunningServer[] = [];

async function stopAll(): Promise<void> {
  await Promise.all(running.splice(0).map((server) => server.stop()));
}

async function start(): Promise<RunningServer> {
  const server = await startServer();
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
