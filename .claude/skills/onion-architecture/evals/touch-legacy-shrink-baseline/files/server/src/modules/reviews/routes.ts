import type { FastifyInstance } from 'fastify';
import { createContainer } from '../../platform/container.js';
import { ReviewsService } from './service.js';

export default async function reviewsRoutes(app: FastifyInstance) {
  const service = new ReviewsService(createContainer());

  app.get('/pulls/:id/reviews', async (req) => service.list((req.params as { id: string }).id));
}
