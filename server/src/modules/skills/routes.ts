import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Skill, SkillImportDraft, SkillVersion } from '@devdigest/shared';
import { SkillCreate, SkillUpdate } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ValidationError } from '../../platform/errors.js';
import { SkillsRepository, drizzleSkillsUnitOfWork } from './repository.js';
import { SkillsService } from './service.js';

const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const ImportUrlBody = z.object({ url: z.string().min(1).max(2048) });

/** Import parses user uploads and fetches URLs — keep it well under the global limit. */
const IMPORT_RATE_LIMIT = { rateLimit: { max: 20, timeWindow: '1 minute' } };

/**
 * L02 — skills module.
 *   GET    /skills                              → list (with agent_count)
 *   GET    /skills/:id                          → one skill
 *   POST   /skills                              → create (writes v1)
 *   PUT    /skills/:id                          → update (a body change appends a version)
 *   DELETE /skills/:id                          → delete (links and versions cascade)
 *   GET    /skills/:id/versions                 → body snapshots, newest first
 *   POST   /skills/:id/versions/:version/restore → copy that body forward as a new version
 *   POST   /skills/import/file                  → multipart .md / .zip → draft (stores nothing)
 *   POST   /skills/import/url                   → { url } → draft (stores nothing)
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SkillsService({
    store: new SkillsRepository(container.db),
    uow: drizzleSkillsUnitOfWork(container.db),
    http: container.httpFetch,
  });

  app.get('/skills', async (req): Promise<Skill[]> => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req): Promise<Skill> => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post('/skills', { schema: { body: SkillCreate } }, async (req, reply): Promise<Skill> => {
    const { workspaceId } = await getContext(container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: SkillUpdate } },
    async (req): Promise<Skill> => {
      const { workspaceId } = await getContext(container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.remove(workspaceId, req.params.id);
    return { ok: true };
  });

  app.get(
    '/skills/:id/versions',
    { schema: { params: IdParams } },
    async (req): Promise<SkillVersion[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listVersions(workspaceId, req.params.id);
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req): Promise<Skill> => {
      const { workspaceId } = await getContext(container, req);
      return service.restore(workspaceId, req.params.id, req.params.version);
    },
  );

  app.post(
    '/skills/import/file',
    { config: IMPORT_RATE_LIMIT },
    async (req): Promise<SkillImportDraft> => {
      await getContext(container, req);
      if (!req.isMultipart()) throw new ValidationError('Send the file as multipart/form-data');
      const part = await req.file();
      if (!part) throw new ValidationError('No file uploaded');
      const data = await part.toBuffer();
      return service.importFile({ filename: part.filename, data });
    },
  );

  app.post(
    '/skills/import/url',
    { schema: { body: ImportUrlBody }, config: IMPORT_RATE_LIMIT },
    async (req): Promise<SkillImportDraft> => {
      await getContext(container, req);
      return service.importUrl(req.body.url);
    },
  );
}
