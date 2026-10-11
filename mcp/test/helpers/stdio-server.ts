import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
export const MCP_JSON = path.join(REPO_ROOT, '.mcp.json');
export const SERVER_KEY = 'devdigest-mcp';

export interface McpJsonEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** The `devdigest-mcp` entry of the root `.mcp.json`, exactly as a client reads it. */
export function readMcpJsonEntry(): McpJsonEntry {
  const parsed = JSON.parse(readFileSync(MCP_JSON, 'utf8')) as { mcpServers: Record<string, McpJsonEntry> };
  const entry = parsed.mcpServers[SERVER_KEY];
  if (!entry) throw new Error(`.mcp.json has no mcpServers["${SERVER_KEY}"] entry`);
  return entry;
}

/** A local port that nothing listens on: it was free a moment ago and is closed again. */
export async function closedLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export interface RunningServer {
  client: Client;
  transport: StdioClientTransport;
  pid: number;
  /** Transport and protocol errors reported by the client side during the session. */
  errors: Error[];
  stderr(): string;
  /** Closes the client and waits until the process is gone; kills it if it is not. Safe to call twice. */
  stop(): Promise<void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Spawns exactly the `command` + `args` of the `.mcp.json` entry from the repository root,
 * with the test's environment plus `DEVDIGEST_API_URL` (a closed port unless `apiUrl` is given),
 * and connects the SDK client.
 */
export async function startServer(opts: { apiUrl?: string } = {}): Promise<RunningServer> {
  const entry = readMcpJsonEntry();
  const apiUrl = opts.apiUrl ?? `http://127.0.0.1:${await closedLocalPort()}`;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  Object.assign(env, entry.env ?? {}, { DEVDIGEST_API_URL: apiUrl });

  const transport = new StdioClientTransport({
    command: entry.command,
    args: entry.args,
    cwd: REPO_ROOT,
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'devdigest-mcp-test', version: '0.0.0' });

  const errors: Error[] = [];
  let stderrText = '';
  client.onerror = (err) => errors.push(err);
  transport.onerror = (err) => errors.push(err);
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderrText += chunk.toString('utf8');
  });

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    const pid = transport.pid;
    try {
      await client.close();
    } catch {
      // the process is killed below if it is still there
    }
    if (pid === null || pid === undefined) return;
    const deadline = Date.now() + 2_000;
    while (isAlive(pid) && Date.now() < deadline) await sleep(25);
    if (isAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
  };

  try {
    await client.connect(transport);
  } catch (err) {
    await stop();
    throw new Error(`could not connect to ${entry.command} ${entry.args.join(' ')}: ${String(err)}\nstderr: ${stderrText}`);
  }
  const pid = transport.pid;
  if (pid === null || pid === undefined) {
    await stop();
    throw new Error('the transport reported no process id');
  }

  return { client, transport, pid, errors, stderr: () => stderrText, stop };
}

/** Polls until `predicate` holds or `timeoutMs` passes; returns whether it held. */
export async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(25);
  }
  return predicate();
}
