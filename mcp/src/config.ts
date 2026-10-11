import { z } from 'zod';
import { DEFAULT_WAIT_SECONDS } from './constants.js';

export interface McpConfig {
  apiUrl: string;
  waitMs: number;
}

const DEFAULT_API_URL = 'http://127.0.0.1:3001';

// A URL is logged and quoted in error texts, so a user or password in it would leak.
function hasCredentials(value: string): boolean {
  try {
    const url = new URL(value);
    return url.username !== '' || url.password !== '';
  } catch {
    return false;
  }
}

// Route paths are appended to the URL, so a query string or fragment cannot work, and would be logged and quoted too.
function hasQueryOrFragment(value: string): boolean {
  try {
    const url = new URL(value);
    return url.search !== '' || url.hash !== '';
  } catch {
    return false;
  }
}

const ApiUrl = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), 'must use http or https')
  .refine((value) => !hasCredentials(value), 'credentials are not allowed in it; remove the user and password')
  .refine((value) => !hasQueryOrFragment(value), 'a query string or fragment is not allowed in it; remove it');

const WaitSeconds = z
  .string()
  .regex(/^\d+$/, 'must be a whole number')
  .transform(Number)
  .pipe(z.number().int().min(1).max(600));

// An unset or empty variable means "use the default".
function present(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

/** `echo: false` keeps the raw value out of the error (a URL may carry credentials). */
function parseVariable<T>(
  name: string,
  schema: z.ZodType<T, z.ZodTypeDef, string>,
  raw: string,
  echo = true,
): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message ?? 'invalid value';
    throw new Error(echo ? `${name} is invalid (${issue}). Got "${raw}".` : `${name} is invalid (${issue}).`);
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

  const apiUrl = rawUrl === undefined ? DEFAULT_API_URL : parseVariable('DEVDIGEST_API_URL', ApiUrl, rawUrl, false);
  const waitSeconds =
    rawWait === undefined ? DEFAULT_WAIT_SECONDS : parseVariable('DEVDIGEST_MCP_WAIT_SECONDS', WaitSeconds, rawWait);

  return { apiUrl: apiUrl.replace(/\/+$/, ''), waitMs: waitSeconds * 1000 };
}
