import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { DEFAULT_API_RATE_LIMIT_MAX, loadConfig } from '../src/platform/config.js';

/**
 * The global API rate limit is configurable (API_RATE_LIMIT_MAX) and is not
 * registered under NODE_ENV=test. No database is reached: the DATABASE_URL points
 * at an unreachable address so the boot-time run reaper never touches a real one,
 * and the probed route answers 422 before any database access.
 */
const UNREACHABLE_DB = 'postgres://x:x@127.0.0.1:1/none';

const env = (extra: Record<string, string>): NodeJS.ProcessEnv =>
  ({ DATABASE_URL: UNREACHABLE_DB, ...extra }) as NodeJS.ProcessEnv;

describe('loadConfig — API_RATE_LIMIT_MAX', () => {
  it('defaults to 120 when unset or empty', () => {
    expect(DEFAULT_API_RATE_LIMIT_MAX).toBe(120);
    expect(loadConfig(env({})).rateLimitMax).toBe(120);
    expect(loadConfig(env({ API_RATE_LIMIT_MAX: '' })).rateLimitMax).toBe(120);
  });

  it('uses a positive integer value', () => {
    expect(loadConfig(env({ API_RATE_LIMIT_MAX: '500' })).rateLimitMax).toBe(500);
  });

  it.each(['0', '-1', '1.5', 'abc'])('throws on %j', (value) => {
    expect(() => loadConfig(env({ API_RATE_LIMIT_MAX: value }))).toThrow();
  });
});

describe('buildApp — global rate limit', () => {
  const probe = { method: 'GET', url: '/repos/not-a-uuid/context' } as const;

  it('answers 429 after API_RATE_LIMIT_MAX requests outside NODE_ENV=test; /health stays open', async () => {
    const app = await buildApp({
      config: loadConfig(env({ NODE_ENV: 'production', LOG_LEVEL: 'silent', API_RATE_LIMIT_MAX: '2' })),
    });
    try {
      expect((await app.inject(probe)).statusCode).toBe(422);
      expect((await app.inject(probe)).statusCode).toBe(422);
      expect((await app.inject(probe)).statusCode).toBe(429);
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('applies no global limit under NODE_ENV=test', async () => {
    const app = await buildApp({
      config: loadConfig(env({ NODE_ENV: 'test', LOG_LEVEL: 'silent', API_RATE_LIMIT_MAX: '2' })),
    });
    try {
      for (let i = 0; i < 3; i++) {
        expect((await app.inject(probe)).statusCode).toBe(422);
      }
    } finally {
      await app.close();
    }
  });
});
