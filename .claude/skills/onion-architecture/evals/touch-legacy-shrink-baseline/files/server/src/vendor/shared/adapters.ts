import type { PullRequest } from './pull';

export interface GitHubClient {
  getPull(repo: string, number: number): Promise<PullRequest>;
}

export interface LLMProvider {
  complete(model: string, prompt: string): Promise<string>;
}
