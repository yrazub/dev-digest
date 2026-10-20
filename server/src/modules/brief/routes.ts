import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefRepository } from './repository.js';
import { BriefService } from './service.js';

/** Each POST is a model call; keep it well under the global limit (R-SRV-38). */
export const BRIEF_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

/**
 * L05 — brief module (see `server/specs/L05-pr-brief.md`).
 *   GET  /pulls/:id/brief → { brief } — the stored brief, `stale` computed on read; never calls a model
 *   POST /pulls/:id/brief → { brief } — generates one: 400 `brief_unavailable` when the provider has
 *                           no key, 422 with no stored files, 502 when the model call fails
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BriefService({
    store: new BriefRepository(container.db),
    intent: container.intent,
    blast: container.blast,
    documents: container.projectContext,
    github: () => container.github(),
    llm: (p) => container.llm(p),
    tokenizer: container.tokenizer,
  });

  app.get('/pulls/:id/brief', { schema: { params: IdParams } }, async (req): Promise<PrBriefResponse> => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId, req.params.id, req.log);
  });

  app.post(
    '/pulls/:id/brief',
    { schema: { params: IdParams }, config: BRIEF_RATE_LIMIT },
    async (req): Promise<PrBriefResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.generate(workspaceId, req.params.id, req.log);
    },
  );
}
