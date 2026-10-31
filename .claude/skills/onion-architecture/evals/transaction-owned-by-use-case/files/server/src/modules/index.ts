import type { FastifyInstance } from 'fastify';
import pulls from './pulls/routes.js';
import reviews from './reviews/routes.js';

export async function registerModules(app: FastifyInstance) {
  await app.register(pulls);
  await app.register(reviews);
}
