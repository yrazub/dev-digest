import { Severity } from '@devdigest/shared';
import { z } from 'zod';

/**
 * The shared contracts and this package must see one Zod instance; with two, a schema
 * derived from a contract (`.pick()` / `.extend()`) mixes classes and fails at runtime.
 * Throws when they differ — the server must be started through `mcp/bin/devdigest-mcp.mjs`,
 * which registers the tsconfig `paths` that pin both to `mcp/node_modules/zod`.
 */
export function assertSingleZod(): void {
  if (!(Severity instanceof z.ZodType)) {
    throw new Error(
      'The shared contracts and this package resolve different copies of zod. ' +
        'Start the server through mcp/bin/devdigest-mcp.mjs so the tsconfig paths apply.',
    );
  }
}
