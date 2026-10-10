import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A minimal client for the `devdigest-mcp` stdio server: newline-delimited JSON-RPC 2.0 over the
 * child's stdin and stdout. Written here on purpose, so `server/` takes no dependency on the MCP SDK.
 *
 * The server is spawned exactly as `.mcp.json` says (`command` + `args`), from the repository root,
 * which is how Claude Code starts it. The caller sets `DEVDIGEST_API_URL`.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
export const MCP_JSON = path.join(REPO_ROOT, '.mcp.json');
export const SERVER_KEY = 'devdigest-mcp';

export interface McpJsonEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** The `devdigest-mcp` entry of the root `.mcp.json`. */
export function readMcpEntry(): McpJsonEntry {
  const parsed = JSON.parse(readFileSync(MCP_JSON, 'utf8')) as { mcpServers?: Record<string, McpJsonEntry> };
  const entry = parsed.mcpServers?.[SERVER_KEY];
  if (!entry) throw new Error(`.mcp.json has no mcpServers["${SERVER_KEY}"] entry`);
  return entry;
}

/**
 * The integration test needs the MCP package's dependencies. A missing install is a failure with
 * the command to run, never a skip (decision D24): a skipped file would hide that nothing was driven.
 */
export function assertMcpInstalled(): void {
  if (!existsSync(path.join(REPO_ROOT, 'mcp', 'node_modules', '@modelcontextprotocol'))) {
    throw new Error('devdigest-mcp is not installed: run `cd mcp && npm ci`');
  }
}

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string | null;
  method?: string;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

export interface ToolCallResult {
  isError: boolean;
  /** The text of the one content block. */
  text: string;
  raw: any;
}

export interface McpProcess {
  pid: number;
  /** Every non-empty line the server wrote to stdout, as written. */
  stdoutLines: string[];
  /** The stdout lines that are not a JSON-RPC 2.0 message. Empty when the protocol stream is clean. */
  invalidLines: string[];
  stderr(): string;
  /** Sends a request and resolves with its response message (a protocol error is returned, not thrown). */
  request(method: string, params?: unknown, timeoutMs?: number): Promise<JsonRpcMessage>;
  notify(method: string, params?: unknown): void;
  /** `initialize` followed by `notifications/initialized`; resolves with the initialize result. */
  initialize(): Promise<any>;
  listTools(): Promise<Array<{ name: string; [key: string]: unknown }>>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
  /** Closes stdin and waits for the process; kills it if it does not leave. Safe to call twice. */
  stop(): Promise<void>;
}

function isJsonRpcMessage(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const msg = value as Record<string, unknown>;
  if (msg.jsonrpc !== '2.0') return false;
  if (typeof msg.method === 'string') return true;
  return 'id' in msg && ('result' in msg || 'error' in msg);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function startMcpServer(opts: { apiUrl: string }): Promise<McpProcess> {
  assertMcpInstalled();
  const entry = readMcpEntry();

  const env: NodeJS.ProcessEnv = { ...process.env, ...(entry.env ?? {}), DEVDIGEST_API_URL: opts.apiUrl };
  const child: ChildProcessWithoutNullStreams = spawn(entry.command, entry.args, {
    cwd: REPO_ROOT,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pid = child.pid;
  if (pid === undefined) throw new Error(`could not spawn ${entry.command} ${entry.args.join(' ')}`);

  // A spawned server must never outlive the test run, even when a hook is skipped by a crash.
  const killOnExit = () => {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  };
  process.once('exit', killOnExit);

  const stdoutLines: string[] = [];
  const invalidLines: string[] = [];
  let stderrText = '';
  let exited = false;
  let buffer = '';
  const pending = new Map<number, { resolve: (m: JsonRpcMessage) => void; reject: (e: Error) => void }>();
  let nextId = 1;

  const failPending = (reason: string) => {
    for (const [id, waiter] of pending) {
      pending.delete(id);
      waiter.reject(new Error(`${reason}\nstderr: ${stderrText}`));
    }
  };

  const onLine = (line: string) => {
    if (line.trim() === '') return;
    stdoutLines.push(line);
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      invalidLines.push(line);
      return;
    }
    if (!isJsonRpcMessage(parsed)) {
      invalidLines.push(line);
      return;
    }
    const msg = parsed as JsonRpcMessage;
    if (typeof msg.id === 'number' && msg.method === undefined) {
      const waiter = pending.get(msg.id);
      if (waiter) {
        pending.delete(msg.id);
        waiter.resolve(msg);
      }
    }
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      onLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderrText += chunk;
  });
  const exitedPromise = new Promise<void>((resolve) => {
    child.once('exit', (code, signal) => {
      exited = true;
      failPending(`devdigest-mcp exited (code ${code}, signal ${signal}) before answering`);
      resolve();
    });
  });
  child.once('error', (err) => failPending(`devdigest-mcp could not run: ${err.message}`));
  // Writing to a closed pipe must not crash the test process.
  child.stdin.on('error', () => {});

  const send = (message: Record<string, unknown>) => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  };

  const request = (method: string, params?: unknown, timeoutMs = 30_000): Promise<JsonRpcMessage> => {
    const id = nextId++;
    return new Promise<JsonRpcMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`no answer to ${method} within ${timeoutMs} ms\nstderr: ${stderrText}`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      send({ id, method, ...(params === undefined ? {} : { params }) });
    });
  };

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    process.removeListener('exit', killOnExit);
    try {
      child.stdin.end();
    } catch {
      // closed already
    }
    await Promise.race([exitedPromise, sleep(2_000)]);
    if (!exited && isAlive(pid)) {
      child.kill('SIGKILL');
      await Promise.race([exitedPromise, sleep(2_000)]);
    }
  };

  const api: McpProcess = {
    pid,
    stdoutLines,
    invalidLines,
    stderr: () => stderrText,
    request,
    notify: (method, params) => send({ method, ...(params === undefined ? {} : { params }) }),
    async initialize() {
      const response = await request('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'devdigest-server-it', version: '0.0.0' },
      });
      if (response.error) throw new Error(`initialize failed: ${JSON.stringify(response.error)}`);
      api.notify('notifications/initialized');
      return response.result;
    },
    async listTools() {
      const response = await request('tools/list', {});
      if (response.error) throw new Error(`tools/list failed: ${JSON.stringify(response.error)}`);
      return response.result.tools;
    },
    async callTool(name, args) {
      const response = await request('tools/call', { name, arguments: args });
      if (response.error) throw new Error(`tools/call ${name} answered a protocol error: ${JSON.stringify(response.error)}`);
      const content = response.result.content as Array<{ type: string; text: string }>;
      if (!Array.isArray(content) || content.length !== 1 || content[0]?.type !== 'text') {
        throw new Error(`tools/call ${name} did not return exactly one text block: ${JSON.stringify(response.result)}`);
      }
      return { isError: response.result.isError === true, text: content[0].text, raw: response.result };
    },
    stop,
  };
  return api;
}
