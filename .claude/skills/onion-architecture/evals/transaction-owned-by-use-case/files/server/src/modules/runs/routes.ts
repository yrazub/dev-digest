import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createContainer } from '../../platform/container.js';
import { RunRepository } from './repository.js';
import { RunService } from './service.js';

export default async function runsRoutes(app: FastifyInstance) {
  const c = createContainer();
  const service = new RunService(c.llm, new RunRepository(c.db));

  app.post(
    '/runs/:id/execute',
    { schema: { params: z.object({ id: z.string() }), body: z.object({ diff: z.string(), model: z.string() }) } },
    async (req) => {
      const { id } = req.params as { id: string };
      const { diff, model } = req.body as { diff: string; model: string };
      return service.execute(id, diff, model);
    },
  );
}
