import type { BlastSourceIndexState, BlastSourceResult } from './domain.js';

/** The two reads of Postgres the blast route makes. */
export interface BlastStore {
  /** The PR's id and repo when it belongs to the workspace, else `undefined`. */
  findPull(workspaceId: string, prId: string): Promise<{ id: string; repoId: string } | undefined>;
  /** The PR's stored changed paths, ordered by path. */
  changedPaths(prId: string): Promise<string[]>;
}

/** The repo-intel facade, as far as the blast module uses it. */
export interface BlastSource {
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastSourceResult>;
  getIndexState(repoId: string): Promise<BlastSourceIndexState>;
}

/** The request logger, as far as the blast module uses it. */
export interface BlastLog {
  info(fields: Record<string, unknown>, message: string): void;
}
