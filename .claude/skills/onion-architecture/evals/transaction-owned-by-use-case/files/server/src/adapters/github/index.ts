import type { GitHubClient, PullRequest } from '@devdigest/shared';
import { ExternalServiceError } from '../../platform/errors.js';

export class GitHubAdapter implements GitHubClient {
  constructor(private readonly token: string) {}

  async getPull(repo: string, number: number): Promise<PullRequest> {
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${number}`, {
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new ExternalServiceError('github', res.status);
    const j: any = await res.json();
    return { id: String(j.id), repo_id: repo, number, title: j.title, state: j.merged ? 'merged' : j.state, merged_at: j.merged_at };
  }
}
