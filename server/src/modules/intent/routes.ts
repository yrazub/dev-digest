import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import type { IntentEventSink } from './service.js';

/** Each POST is a model call; keep it well under the global limit. */
const DERIVE_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

/** Mirrors the service's events to the request log (`info` level, kind in the fields). */
function logSink(req: FastifyRequest): IntentEventSink {
  return (kind, msg, data) => {
    req.log.info(data === undefined ? { kind } : { kind, data }, msg);
  };
}

/**
 * L03 — intent module (see `server/specs/L03-intent-layer.md`).
 *   GET  /pulls/:id/intent → { intent } — the stored intent, `stale` computed on read; never computes
 *   POST /pulls/:id/intent → { intent } — always recomputes (Derive / Re-run); 400 `intent_unavailable`
 *                            when the configured provider has no key, 502 when the model call fails
 *
 * The service is built in the composition root (`container.intent`) because the review
 * run reaches it too.
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/pulls/:id/intent', { schema: { params: IdParams } }, async (req): Promise<PrIntentResponse> => {
    const { workspaceId } = await getContext(container, req);
    return { intent: await container.intent.get(workspaceId, req.params.id, { onEvent: logSink(req) }) };
  });

  app.post(
    '/pulls/:id/intent',
    { schema: { params: IdParams }, config: DERIVE_RATE_LIMIT },
    async (req): Promise<PrIntentResponse> => {
      const { workspaceId } = await getContext(container, req);
      const onEvent = logSink(req);
      onEvent('tool', 'Deriving PR intent…');
      return { intent: await container.intent.regenerate(workspaceId, req.params.id, { onEvent }) };
    },
  );
}
