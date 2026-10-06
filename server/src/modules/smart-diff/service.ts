import type { SmartDiffResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { SmartDiffRepository } from './repository.js';
import { buildSmartDiff, countedFindings } from './domain.js';

export interface SmartDiffServiceDeps {
  repo: SmartDiffRepository;
}

/**
 * L03 — smart-diff service. Reads Postgres only: no GitHub, no model, no write.
 */
export class SmartDiffService {
  constructor(private readonly deps: SmartDiffServiceDeps) {}

  async forPull(workspaceId: string, prId: string): Promise<SmartDiffResponse> {
    const { repo } = this.deps;
    if (!(await repo.findPull(workspaceId, prId))) throw new NotFoundError('Pull request not found');
    const [files, reviews] = await Promise.all([repo.files(prId), repo.reviews(prId)]);
    return buildSmartDiff(files, countedFindings(reviews));
  }
}
