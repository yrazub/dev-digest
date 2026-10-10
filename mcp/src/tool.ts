import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { McpConfig } from './config.js';

/** An error whose message is written for the calling model; it is returned as the tool result. */
export class ToolFailure extends Error {}

export interface ToolContext {
  signal?: AbortSignal;
  progress?: (message: string) => void;
}

export interface ToolDeps {
  config: McpConfig;
  log: (line: string) => void;
}

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  /** Flat: scalars and enums only. */
  inputShape: S;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean; openWorldHint?: boolean };
  run(args: z.infer<z.ZodObject<S>>, deps: ToolDeps, ctx: ToolContext): Promise<Record<string, unknown>>;
}

/** One text block holding the compact JSON of the payload; no `structuredContent`. */
export function toolOk(payload: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

/** Collapses whitespace, masks token-like substrings and cuts at `max` with an ellipsis. */
export function sanitizeText(text: string, max: number): string {
  const collapsed = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(sk-|sk_|ghp_|gho_|github_pat_|xox)[A-Za-z0-9_-]{16,}/g, '***');
  return collapsed.length > max ? `${collapsed.slice(0, Math.max(0, max - 1))}…` : collapsed;
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const field =
        issue.code === 'unrecognized_keys' ? issue.keys.join(', ') : issue.path.join('.') || 'arguments';
      const message = issue.code === 'unrecognized_keys' ? 'unknown argument' : issue.message;
      return `${field}: ${message}`;
    })
    .join('; ');
}

function errorResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/**
 * Turns anything thrown by a tool into an `isError` result. A `ToolFailure` is shown as written;
 * a Zod error becomes E-ARGS; anything else becomes E-INTERNAL and its detail goes to the log only.
 */
export function toolError(err: unknown, deps: Pick<ToolDeps, 'config' | 'log'>, toolName: string): CallToolResult {
  if (err instanceof ToolFailure) return errorResult(err.message);
  if (err instanceof z.ZodError) {
    return errorResult(`Invalid arguments for ${toolName}: ${describeIssues(err)}.`);
  }
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  deps.log(`devdigest-mcp: ${toolName} failed: ${detail}`);
  return errorResult(
    `devdigest-mcp hit an unexpected error in ${toolName}. Details are in the server's stderr log; retry once, then report it to the user.`,
  );
}

/** The one path for every tool: parse the arguments, run, wrap the payload. */
export async function executeTool(
  def: ToolDef,
  rawArgs: unknown,
  deps: ToolDeps,
  ctx: ToolContext = {},
): Promise<CallToolResult> {
  try {
    const parsed = z.object(def.inputShape).strict().safeParse(rawArgs ?? {});
    if (!parsed.success) {
      const expected = Object.keys(def.inputShape).join(', ') || 'none';
      throw new ToolFailure(
        `Invalid arguments for ${def.name}: ${describeIssues(parsed.error)}. Expected: ${expected}.`,
      );
    }
    return toolOk(await def.run(parsed.data, deps, ctx));
  } catch (err) {
    return toolError(err, deps, def.name);
  }
}
