import { z } from 'zod';
import { listReviews } from './service';

const Query = z.object({ repoId: z.string() });

export async function reviewRoutes(app) {
  app.get('/reviews', { schema: { querystring: Query } }, async (req) => listReviews(req.query.repoId));
}
