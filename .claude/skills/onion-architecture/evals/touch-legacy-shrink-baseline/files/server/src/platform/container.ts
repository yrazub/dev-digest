import type { GitHubClient, LLMProvider } from '@devdigest/shared';
import { db, type Db } from '../db/client.js';
import { GitHubAdapter } from '../adapters/github/index.js';
import { loadConfig } from './config.js';

export interface Container {
  db: Db;
  github: GitHubClient;
  llm: LLMProvider;
}

export function createContainer(overrides: Partial<Container> = {}): Container {
  const config = loadConfig();
  return {
    db,
    github: new GitHubAdapter(config.GITHUB_TOKEN ?? ''),
    llm: { complete: async () => '[]' },
    ...overrides,
  };
}
