import { assertSingleZod } from './single-zod.js';

// Entry and composition root. stdout is the MCP protocol: write only to stderr here.
try {
  assertSingleZod();
} catch (err) {
  process.stderr.write(`devdigest-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

process.stderr.write('devdigest-mcp: no transport yet\n');
process.exit(0);
