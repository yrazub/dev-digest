import type { FastifyRequest } from 'fastify';
import type { Container } from '../../platform/container.js';
import { ConfigError } from '../../platform/errors.js';

export interface RequestContext {
  workspaceId: string;
  userId: string;
}

/**
 * Resolve the tenancy context for a request via the AuthProvider. In MVP
 * (LocalNoAuthProvider) this always returns the default workspace + system user.
 * Every module uses this so workspace scoping is never forgotten.
 *
 * Fails loudly when the provider answers without an id: a query scoped by an
 * empty workspace id would match nothing and read as "no data".
 */
export async function getContext(
  container: Container,
  req: FastifyRequest,
): Promise<RequestContext> {
  const [user, workspace] = await Promise.all([
    container.auth.currentUser(req),
    container.auth.currentWorkspace(req),
  ]);
  if (!workspace.id || !user.id) {
    throw new ConfigError('The auth provider returned no workspace or user for this request');
  }
  return { workspaceId: workspace.id, userId: user.id };
}
