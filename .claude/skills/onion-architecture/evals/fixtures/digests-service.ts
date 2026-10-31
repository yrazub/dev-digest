// server/src/modules/digests/service.ts
import { and, eq, gte } from 'drizzle-orm';
import * as t from '../../db/schema';
import { GitHubAdapter } from '../../adapters/github';
import type { Container } from '../../platform/container';

export class DigestService {
  private readonly github = new GitHubAdapter(process.env.GITHUB_TOKEN ?? '');

  constructor(private readonly container: Container) {}

  async recentMerged(repoId: string) {
    const since = new Date(Date.now() - 7 * 86_400_000);
    return this.container.db
      .select()
      .from(t.pullRequests)
      .where(
        and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.state, 'merged'), gte(t.pullRequests.mergedAt, since)),
      );
  }

  async head(repoId: string) {
    return this.github.getPull(repoId, 1);
  }
}
