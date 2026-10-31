// server/src/modules/pulls/service.ts
import type { PullRequest } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors';
import type { PullStore } from './ports';

export class PullsService {
  constructor(private readonly pulls: PullStore) {}

  async list(repoId: string): Promise<PullRequest[]> {
    const rows = await this.pulls.listByRepo(repoId);
    if (rows.length === 0) throw new NotFoundError(`repo ${repoId}`);
    return rows;
  }
}
