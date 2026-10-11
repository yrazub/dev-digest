import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastRepository } from './repository.js';
import { BlastService } from './service.js';
import type { BlastSource } from './ports.js';

/**
 * L04 — blast module (see `server/specs/L04-blast-radius.md`).
 *   GET /pulls/:id/blast → the symbols declared in the PR's changed files, who calls them, and
 *                          the endpoints and cron jobs in the calling files; reads the
 *                          repo-intel index only
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // The assignment is the compile-time check: a facade reason or index status this module does
  // not know fails `typecheck` instead of a request.
  const source: BlastSource = container.repoIntel;
  const service = new BlastService({
    store: new BlastRepository(container.db),
    source,
    repoIntelEnabled: container.config.repoIntelEnabled,
    callerLimit: container.repoIntelLimits.callersPerSymbol,
  });

  app.get('/pulls/:id/blast', { schema: { params: IdParams } }, async (req): Promise<BlastRadiusResponse> => {
    const { workspaceId } = await getContext(container, req);
    return service.forPull(workspaceId, req.params.id, req.log);
  });
}
