import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrMeta, PrDetail, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PullsRepository } from './repository.js';
import { PullsService } from './service.js';

/**
 * F1 — pulls module. PR import via Octokit (list + per-PR detail).
 *   GET  /repos/:id/pulls    → list PRs for a repo (open + recently merged/closed,
 *                              synced from GitHub, persisted). `status` is GitHub's
 *                              merge state (open/merged/closed).
 *   GET  /pulls/:id          → full PR detail (diff/files, commits, body, linked issue)
 *   GET  /pulls/:id/comments → inline review comments, proxied live to GitHub
 *   POST /pulls/:id/comments → create one on GitHub
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new PullsService({
    repo: new PullsRepository(container.db),
    github: () => container.github(),
    log: app.log,
  });

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    return service.listForRepo(workspaceId, req.params.id);
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(container, req);
    return service.getDetail(workspaceId, req.params.id);
  });

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listComments(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(container, req);
      return service.postComment(workspaceId, req.params.id, req.body);
    },
  );
}
