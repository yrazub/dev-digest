import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { EvalCaseCreateResponse, EvalCaseList } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalRepository } from './repository.js';
import { EvalService } from './service.js';

/**
 * L06 — eval module (see `server/specs/eval-pipeline.md`).
 *   POST   /findings/:id/eval-case → 201 / 200 { case, created } — a case from a decided finding
 *   GET    /agents/:id/eval-cases  → { cases } — newest first
 *   DELETE /eval-cases/:id         → 204
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new EvalService({ store: new EvalRepository(container.db), git: container.git });

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
}
