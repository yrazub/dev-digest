import * as t from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { EvalSuiteRunDetail } from '@devdigest/shared';
import type { PgFixture } from './pg.js';

/**
 * `runReview` is fire-and-forget: the POST returns runIds immediately and each
 * agent's review is persisted in the background (the client subscribes to SSE).
 * Tests that assert on persisted reviews/findings/traces must first wait for the
 * background runs to finish. This polls `agent_runs` until every row for the PR
 * reaches a terminal status (done / failed / cancelled).
 */
const TERMINAL = new Set(['done', 'failed', 'cancelled']);

export async function waitForPrRuns(
  db: PgFixture['handle']['db'],
  prId: string,
  opts: { expected?: number; timeoutMs?: number } = {},
): Promise<Array<typeof t.agentRuns.$inferSelect>> {
  const { expected, timeoutMs = 10_000 } = opts;
  const start = Date.now();
  for (;;) {
    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const terminal = runs.filter((r) => TERMINAL.has(r.status ?? ''));
    // With an explicit `expected`, wait until that many runs finish (ignores any
    // extra rows, e.g. a trifecta scan). Otherwise wait for all rows to settle.
    const done =
      expected != null
        ? terminal.length >= expected
        : runs.length > 0 && terminal.length === runs.length;
    if (done) return runs;
    if (Date.now() - start > timeoutMs) return runs;
    await new Promise((r) => setTimeout(r, 25));
  }
}

/**
 * Read `GET /runs/<runId>/trace` once the trace document exists.
 *
 * The executor marks the run `done` BEFORE it writes the trace, so `waitForPrRuns` returning is
 * not enough: a single read right after it can hit a 404 and the test then fails on an
 * `undefined` body. This requests the trace every 25 ms until the status is 200 and resolves
 * the parsed body; after `timeoutMs` (default 10 000) it throws.
 *
 * `T` is the body type the caller expects; it defaults to `any`, which is what `res.json()`
 * returns, so a caller that does not name one compiles as it would with a plain
 * `app.inject(...).json()`.
 */
export async function waitForRunTrace<T = any>(
  app: FastifyInstance,
  runId: string,
  opts: { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 10_000 } = opts;
  const start = Date.now();
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/runs/${runId}/trace` });
    if (res.statusCode === 200) return res.json() as T;
    if (Date.now() - start > timeoutMs) throw new Error(`trace of run ${runId} was never persisted`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/**
 * Poll `GET /eval-runs/:id` until the eval run leaves `running`, and resolve the final detail.
 * An eval run is fire-and-forget like a review run: `POST /agents/:id/eval-runs` answers 202 with
 * the run `running` and the cases are reviewed in the background. After `timeoutMs` (default
 * 15 000) it throws, with the last status in the message, so a hung run fails loudly.
 */
export async function waitForEvalRun(
  app: FastifyInstance,
  runId: string,
  opts: { timeoutMs?: number } = {},
): Promise<EvalSuiteRunDetail> {
  const { timeoutMs = 15_000 } = opts;
  const start = Date.now();
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/eval-runs/${runId}` });
    if (res.statusCode === 200) {
      const run = res.json() as EvalSuiteRunDetail;
      if (run.status !== 'running') return run;
    } else if (res.statusCode !== 404) {
      throw new Error(`GET /eval-runs/${runId} answered ${res.statusCode}`);
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`eval run ${runId} did not finish within ${timeoutMs} ms (last answer ${res.statusCode})`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}
