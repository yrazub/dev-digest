#!/usr/bin/env node
// The one way to start devdigest-mcp. Plain JavaScript, never compiled.
// Registers tsx with the package's tsconfig (so `@devdigest/shared` and `zod` resolve to one
// copy), then imports the TypeScript entry. Writes nothing to stdout: stdout is the protocol.
import { fileURLToPath } from 'node:url';

let register;
try {
  ({ register } = await import('tsx/esm/api'));
} catch {
  process.stderr.write('devdigest-mcp: dependencies are not installed. Run: cd mcp && npm ci\n');
  process.exit(1);
}

register({ tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) });
await import(new URL('../src/main.ts', import.meta.url).href);
