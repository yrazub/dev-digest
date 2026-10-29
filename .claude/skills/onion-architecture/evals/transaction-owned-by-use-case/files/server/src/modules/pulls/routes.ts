import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PullRequest } from '@devdigest/shared';
import { db } from '../../db/client.js';
import { PullRepository } from './repository.js';
import { PullsService } from './service.js';

export default async function pullsRoutes(app: FastifyInstance) {
  const service = new PullsService(new PullRepository(db));

  app.get(
    '/repos/:id/pulls',
    { schema: { params: z.object({ id: z.string() }), response: { 200: z.array(PullRequest) } } },
    async (req) => service.list((req.params as { id: string }).id),
  );
}
