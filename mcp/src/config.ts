import { z } from 'zod';
import { DEFAULT_WAIT_SECONDS } from './constants.js';

export interface McpConfig {
  apiUrl: string;
  waitMs: number;
}

const DEFAULT_API_URL = 'http://127.0.0.1:3001';

const ApiUrl = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'must use http or https');

const WaitSeconds = z
  .string()
  .regex(/^\d+$/, 'must be a whole number')
  .transform(Number)
  .pipe(z.number().int().min(1).max(600));

// An unset or empty variable means "use the default".
function present(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

function parseVariable<T>(name: string, schema: z.ZodType<T, z.ZodTypeDef, string>, raw: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message ?? 'invalid value';
    throw new Error(`${name} is invalid (${issue}). Got "${raw}".`);
  }
  return parsed.data;
}

/**
 * Reads the two environment variables of the server. Takes the environment as an argument:
 * only `main.ts` touches `process`.
 */
export function loadMcpConfig(env: NodeJS.ProcessEnv): McpConfig {
  const rawUrl = present(env.DEVDIGEST_API_URL);
  const rawWait = present(env.DEVDIGEST_MCP_WAIT_SECONDS);

  const apiUrl = rawUrl === undefined ? DEFAULT_API_URL : parseVariable('DEVDIGEST_API_URL', ApiUrl, rawUrl);
  const waitSeconds =
    rawWait === undefined ? DEFAULT_WAIT_SECONDS : parseVariable('DEVDIGEST_MCP_WAIT_SECONDS', WaitSeconds, rawWait);

  return { apiUrl: apiUrl.replace(/\/+$/, ''), waitMs: waitSeconds * 1000 };
}
