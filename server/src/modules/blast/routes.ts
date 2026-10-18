import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { BlastRadiusResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * L04 — blast module (see `server/specs/L04-blast-radius.md`).
 *   GET /pulls/:id/blast → the symbols declared in the PR's changed files, who calls them, and
 *                          the endpoints and cron jobs in the calling files; reads the
 *                          repo-intel index only
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // `container.blast` is built in the composition root, where the facade is checked against
  // `BlastSource`: a reason or index status this module does not know fails `typecheck`.
  const service = container.blast;

  app.get('/pulls/:id/blast', { schema: { params: IdParams } }, async (req): Promise<BlastRadiusResponse> => {
    const { workspaceId } = await getContext(container, req);
    return service.forPull(workspaceId, req.params.id, req.log);
  });
}
