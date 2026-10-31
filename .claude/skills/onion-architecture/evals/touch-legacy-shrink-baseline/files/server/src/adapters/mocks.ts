import type { GitHubClient, LLMProvider, PullRequest } from '@devdigest/shared';

export class MockGitHub implements GitHubClient {
  async getPull(repo: string, number: number): Promise<PullRequest> {
    return { id: `${repo}#${number}`, repo_id: repo, number, title: 'mock', state: 'open', merged_at: null };
  }
}

export class MockLLM implements LLMProvider {
  async complete(): Promise<string> { return '[]'; }
}
