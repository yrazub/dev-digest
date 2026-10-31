import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createContainer } from '../../platform/container.js';
import { ReviewsService } from './service.js';

export default async function reviewsRoutes(app: FastifyInstance) {
  const c = createContainer();
  const service = new ReviewsService(c.llm);

  app.post(
    '/reviews/preview',
    { schema: { body: z.object({ diff: z.string() }) } },
    async (req) => service.reviewDiff((req.body as { diff: string }).diff),
  );
}
