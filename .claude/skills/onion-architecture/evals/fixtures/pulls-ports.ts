// server/src/modules/pulls/ports.ts
import type { PullRequest } from '@devdigest/shared';

export interface PullStore {
  listByRepo(repoId: string): Promise<PullRequest[]>;
}
