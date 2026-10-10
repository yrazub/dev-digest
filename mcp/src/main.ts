import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HttpDevDigestApi } from './api-client.js';
import { loadMcpConfig } from './config.js';
import { createMcpServer } from './server.js';
import { assertSingleZod } from './single-zod.js';

// Entry and composition root. stdout is the MCP protocol: write only to stderr here.
const log = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

function fail(err: unknown): never {
  log(`devdigest-mcp: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

try {
  assertSingleZod();
} catch (err) {
  fail(err);
}

let config;
try {
  config = loadMcpConfig(process.env);
} catch (err) {
  fail(err);
}

const api = new HttpDevDigestApi({ baseUrl: config.apiUrl });
const server = createMcpServer({ api, config, log });
const transport = new StdioServerTransport();

let closing = false;
const shutdown = (): void => {
  if (closing) return;
  closing = true;
  server.close().then(
    () => process.exit(0),
    () => process.exit(0),
  );
};

// The SDK transport does not report the end of stdin as a close; the client going away must end us.
process.stdin.on('end', shutdown);
process.stdin.on('close', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
server.server.onclose = shutdown;
process.on('unhandledRejection', (reason) => {
  log(`devdigest-mcp: unhandled rejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`);
});
process.on('uncaughtException', (err) => {
  log(`devdigest-mcp: uncaught error: ${err.stack ?? err.message}`);
  process.exit(1);
});

await server.connect(transport);
log(`devdigest-mcp ready (API ${config.apiUrl})`);
