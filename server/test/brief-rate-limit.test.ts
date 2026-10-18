import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';

/**
 * `POST /pulls/:id/brief` carries its own rate limit of 10 per minute (R-SRV-38, AC-80). The
 * limit is not registered under NODE_ENV=test, so the app is built as production, with a global
 * limit so high that only the per-route `config.rateLimit` can answer 429. No database is
 * reached: the DATABASE_URL is unreachable and the probe fails `IdParams` (422) before any
 * database access. Same set-up as `app-rate-limit.test.ts`.
 */
const UNREACHABLE_DB = 'postgres://x:x@127.0.0.1:1/none';

const buildLimited = () =>
  buildApp({
    config: loadConfig({
      DATABASE_URL: UNREACHABLE_DB,
      NODE_ENV: 'production',
      LOG_LEVEL: 'silent',
      API_RATE_LIMIT_MAX: '10000',
    } as NodeJS.ProcessEnv),
  });

describe('POST /pulls/:id/brief — per-route rate limit', () => {
  it('answers 422 for the first 10 requests and 429 for the 11th, under a high global limit', async () => {
    const app = await buildLimited();
    try {
      const probe = { method: 'POST', url: '/pulls/not-a-uuid/brief' } as const;
      for (let i = 0; i < 10; i++) {
        expect((await app.inject(probe)).statusCode).toBe(422);
      }
      expect((await app.inject(probe)).statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });

  it('limits POST only: twelve GET requests on the same app all answer 422', async () => {
    const app = await buildLimited();
    try {
      for (let i = 0; i < 12; i++) {
        expect((await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/brief' })).statusCode).toBe(422);
      }
    } finally {
      await app.close();
    }
  });
});
