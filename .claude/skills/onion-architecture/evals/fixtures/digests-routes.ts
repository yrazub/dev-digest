// server/src/modules/digests/routes.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import * as t from '../../db/schema';
import { createContainer } from '../../platform/container';
import { DigestService } from './service';

const Params = z.object({ id: z.string() });

export default async function digestRoutes(app: FastifyInstance) {
  const service = new DigestService(createContainer());

  app.get('/repos/:id/digest', async (req, reply) => {
    const { id } = Params.parse(req.params);
    const [row] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, id)).limit(1);
    if (!row) return reply.status(404).send({ error: 'repo not found' });
    return service.recentMerged(id);
  });
}
