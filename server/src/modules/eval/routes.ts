import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type {
  EvalCaseCreateResponse,
  EvalCaseList,
  EvalOverview,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalSuiteRunList,
} from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RUN_PAGE_DEFAULT, RUN_PAGE_MAX } from './constants.js';
import { EvalRepository } from './repository.js';
import { EvalService } from './service.js';
import { EvalRunExecutor } from './run-executor.js';

/** Each POST starts up to 50 model calls; keep it well under the global limit (R-SRV-34). */
export const EVAL_RUN_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

const RunListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(RUN_PAGE_MAX).default(RUN_PAGE_DEFAULT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * L06 — eval module (see `server/specs/eval-pipeline.md`).
 *   POST   /findings/:id/eval-case → 201 / 200 { case, created } — a case from a decided finding
 *   GET    /agents/:id/eval-cases  → { cases } — newest first
 *   DELETE /eval-cases/:id         → 204
 *   POST   /agents/:id/eval-runs   → 202 EvalSuiteRun — starts a background run (400 `eval_unavailable`,
 *                                    409 `eval_run_in_progress`, 422 no cases / more than 50)
 *   GET    /agents/:id/eval-runs   → { runs, total } — newest first, `limit` / `offset`
 *   GET    /eval-runs/:id          → EvalSuiteRunDetail — the run with its case results
 *   GET    /evals/overview         → EvalOverview — every agent's latest done run, trend, counts
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const store = new EvalRepository(container.db);
  const service = new EvalService({
    store,
    git: container.git,
    llm: (p) => container.llm(p),
    executor: new EvalRunExecutor({ store, review: reviewPullRequest, parseDiff: parseUnifiedDiff }),
  });

  app.post(
    '/findings/:id/eval-case',
    { schema: { params: IdParams } },
    async (req, reply): Promise<EvalCaseCreateResponse> => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.createCase(workspaceId, req.params.id);
      reply.status(result.created ? 201 : 200);
      return result;
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams } },
    async (req): Promise<EvalCaseList> => {
      const { workspaceId } = await getContext(container, req);
      return service.listCases(workspaceId, req.params.id);
    },
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    await service.deleteCase(workspaceId, req.params.id);
    return reply.status(204).send();
  });

  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams }, config: EVAL_RUN_RATE_LIMIT },
    async (req, reply): Promise<EvalSuiteRun> => {
      const { workspaceId } = await getContext(container, req);
      const run = await service.startRun(workspaceId, req.params.id, req.log);
      reply.status(202);
      return run;
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, querystring: RunListQuery } },
    async (req): Promise<EvalSuiteRunList> => {
      const { workspaceId } = await getContext(container, req);
      return service.listRuns(workspaceId, req.params.id, req.query.limit, req.query.offset);
    },
  );

  app.get('/eval-runs/:id', { schema: { params: IdParams } }, async (req): Promise<EvalSuiteRunDetail> => {
    const { workspaceId } = await getContext(container, req);
    return service.getRun(workspaceId, req.params.id);
  });

  app.get('/evals/overview', async (req): Promise<EvalOverview> => {
    const { workspaceId } = await getContext(container, req);
    return service.overview(workspaceId);
  });
}
