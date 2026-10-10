import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffRepository } from './repository.js';
import { SmartDiffService } from './service.js';

/**
 * L03 — smart-diff module (see `server/specs/L03-smart-diff.md`).
 *   GET /pulls/:id/smart-diff → the PR's files grouped by role, with the lines that carry a
 *                               counted finding; reads Postgres only
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SmartDiffService({ repo: new SmartDiffRepository(container.db) });

  app.get('/pulls/:id/smart-diff', { schema: { params: IdParams } }, async (req): Promise<SmartDiffResponse> => {
    const { workspaceId } = await getContext(container, req);
    return service.forPull(workspaceId, req.params.id);
  });
}
