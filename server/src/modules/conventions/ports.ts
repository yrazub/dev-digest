import type {
  ConventionCategory,
  ConventionStatus,
  FeatureModelChoice,
  LLMProvider,
  RepoRef,
} from '@devdigest/shared';
import type { ConventionRecord } from './domain.js';
import type { VerifiedCandidate } from './verify.js';

/**
 * Ports for the conventions service. Persistence is `repository.ts`; the
 * outside world (repo-intel, the clone, the LLM) is wired in `routes.ts`.
 */

export interface ScanRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  /** `repo_index_state.last_indexed_sha`; null when the repo was never indexed. */
  indexedSha: string | null;
}

export interface ScanInfoRecord {
  lastScanAt: string;
  sampledFiles: number;
}

export interface ConventionChanges {
  status?: ConventionStatus;
  rule?: string;
  category?: ConventionCategory;
}

export interface ConventionStore {
  findRepo(workspaceId: string, repoId: string): Promise<ScanRepo | undefined>;
  /** All of the repo's candidates, every status: pending first, then by confidence. */
  list(workspaceId: string, repoId: string): Promise<ConventionRecord[]>;
  /** One candidate and the repo it belongs to. */
  find(workspaceId: string, id: string): Promise<{ record: ConventionRecord; repoId: string } | undefined>;
  update(workspaceId: string, id: string, changes: ConventionChanges): Promise<void>;
  deletePending(workspaceId: string, repoId: string): Promise<void>;
  insertMany(workspaceId: string, repoId: string, rows: VerifiedCandidate[]): Promise<void>;
  getScanInfo(workspaceId: string, repoId: string): Promise<ScanInfoRecord | undefined>;
  saveScanInfo(workspaceId: string, userId: string, repoId: string, info: ScanInfoRecord): Promise<void>;
}

/** Runs `work` in one transaction; the store it receives writes through that transaction. */
export interface ConventionsUnitOfWork {
  run<T>(work: (store: ConventionStore) => Promise<T>): Promise<T>;
}

/** repo-intel's ranked sample (`RepoIntel.getConventionSamples`). */
export interface ConventionSampleSource {
  getConventionSamples(repoId: string, n: number): Promise<string[]>;
}

/** Reads a file from the repo's clone (`GitClient.readFile`). */
export interface RepoFileReader {
  readFile(repo: RepoRef, path: string): Promise<string>;
}

/** The workspace's Conventions model, and a client for its provider. */
export interface ConventionModelGateway {
  resolve(workspaceId: string): Promise<FeatureModelChoice>;
  provider(id: FeatureModelChoice['provider']): Promise<LLMProvider>;
}
