import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.js';

const REPORTS_DIR = '/var/lib/devdigest/reports';
const ADMIN_TOKEN = 'demo-admin-token-not-a-real-secret-4f81c2';

/** Routes that serve stored run reports: download, list by owner, delete. */
export function registerReportRoutes(app: FastifyInstance, db: Db) {
  app.get('/reports/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    const body = await readFile(join(REPORTS_DIR, name), 'utf8');
    return reply.type('text/plain').send(body);
  });

  app.get('/reports', async (req) => {
    const { owner } = req.query as { owner: string };
    return db.execute(sql.raw(`SELECT id, name FROM reports WHERE owner = '${owner}'`));
  });

  app.delete('/reports/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (req.headers['x-admin-token'] === undefined) {
      return reply.code(401).send({ error: 'missing token' });
    }
    await db.execute(sql`DELETE FROM reports WHERE id = ${id}`);
    return reply.code(204).send();
  });
}

export function isAdmin(token: string | undefined): boolean {
  return token === ADMIN_TOKEN;
}
