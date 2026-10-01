import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ConventionCandidate, ConventionExtractResult, ConventionList } from '@devdigest/shared';
import { ConventionUpdate } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { resolveFeatureModel } from '../_shared/repository/feature-models.repo.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsRepository, drizzleConventionsUnitOfWork } from './repository.js';
import { ConventionsService } from './service.js';

/** A scan is one LLM call over ~20 files — keep it well under the global limit. */
const EXTRACT_RATE_LIMIT = { rateLimit: { max: 5, timeWindow: '1 minute' } };

/**
 * L02 — Conventions Extractor.
 *   POST  /repos/:id/conventions/extract → run the scan (synchronous), all candidates + stats
 *   GET   /repos/:id/conventions         → scan info + all candidates (every status)
 *   PATCH /conventions/:id               → accept / reject / inline edit
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ConventionsService({
    store: new ConventionsRepository(container.db),
    uow: drizzleConventionsUnitOfWork(container.db),
    samples: container.repoIntel,
    files: container.git,
    models: {
      resolve: (workspaceId) => resolveFeatureModel(container.db, workspaceId, 'conventions'),
      provider: (id) => container.llm(id),
    },
  });

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams }, config: EXTRACT_RATE_LIMIT },
    async (req): Promise<ConventionExtractResult> => {
      const { workspaceId, userId } = await getContext(container, req);
      return service.extract(workspaceId, userId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams } },
    async (req): Promise<ConventionList> => {
      const { workspaceId } = await getContext(container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: ConventionUpdate } },
    async (req): Promise<ConventionCandidate> => {
      const { workspaceId } = await getContext(container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );
}
