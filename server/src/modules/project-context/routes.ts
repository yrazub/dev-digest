import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type {
  AgentContext,
  ProjectContextFile,
  ProjectContextList,
  SkillContext,
} from '@devdigest/shared';
import { ContextPathsInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/** A plain string: a bad path is a 404 from the service (R-SRV-36), not a 422. */
const FileQuery = z.object({ path: z.string() });

/**
 * L05 — project-context module.
 *   GET /repos/:id/context              → discovered documents (no content)
 *   GET /repos/:id/context/file?path=   → one document with its content and "Used by"
 *   GET /agents/:id/context             → the agent's attached paths
 *   PUT /agents/:id/context             → replace them (never bumps the agent's version)
 *   GET /skills/:id/context             → the skill's attached paths
 *   PUT /skills/:id/context             → replace them (never bumps the skill's version)
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams } },
    async (req): Promise<ProjectContextList> => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: FileQuery } },
    async (req): Promise<ProjectContextFile> => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.file(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get(
    '/agents/:id/context',
    { schema: { params: IdParams } },
    async (req): Promise<AgentContext> => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.agentContext(workspaceId, req.params.id);
    },
  );

  app.put(
    '/agents/:id/context',
    { schema: { params: IdParams, body: ContextPathsInput } },
    async (req): Promise<AgentContext> => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.setAgentContext(workspaceId, req.params.id, req.body.paths);
    },
  );

  app.get(
    '/skills/:id/context',
    { schema: { params: IdParams } },
    async (req): Promise<SkillContext> => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.skillContext(workspaceId, req.params.id);
    },
  );

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, body: ContextPathsInput } },
    async (req): Promise<SkillContext> => {
      const { workspaceId } = await getContext(container, req);
      return container.projectContext.setSkillContext(workspaceId, req.params.id, req.body.paths);
    },
  );
}
