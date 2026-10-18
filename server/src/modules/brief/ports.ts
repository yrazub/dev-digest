import type {
  BlastRadiusResponse,
  FeatureModelChoice,
  PrBriefRecord,
  Severity,
} from '@devdigest/shared';

/**
 * Ports of the brief service. The Drizzle implementation of `BriefStore` is `repository.ts`;
 * the intent, blast and project-context services are reached through the container and
 * declared here structurally, because a module never imports another module. Structural types
 * only — no Drizzle row type crosses this line.
 */

/** The pull request a brief is written for, with its repository. */
export interface BriefPull {
  id: string;
  repoId: string;
  title: string;
  body: string | null;
  headSha: string;
  additions: number;
  deletions: number;
  filesCount: number;
  repo: { owner: string; name: string; clonePath: string | null };
}

export interface BriefStore {
  /** Workspace-scoped PR lookup; `undefined` for an unknown or foreign PR. */
  findPull(workspaceId: string, prId: string): Promise<BriefPull | undefined>;
  /** The PR's stored changed files, ordered by path. */
  changedFiles(
    prId: string,
  ): Promise<{ path: string; additions: number; deletions: number; patch: string | null }[]>;
  /** The findings of the newest `kind = 'review'` review whose run is `done`; `[]` when there is none. */
  latestReviewFindings(
    prId: string,
  ): Promise<{ file: string; line: number; severity: Severity; title: string; dismissed: boolean }[]>;
  /** The workspace's `risk_brief` model: its override, else the registry default. */
  featureModel(workspaceId: string): Promise<FeatureModelChoice>;
  /** `undefined` for no row, and for a row that does not parse (reported through `onUnreadable`). */
  readBrief(
    prId: string,
    opts: { onUnreadable: () => void },
  ): Promise<Omit<PrBriefRecord, 'stale'> | undefined>;
  /** Insert or replace the PR's brief (keyed on `pr_id`). */
  saveBrief(prId: string, record: Omit<PrBriefRecord, 'stale'>): Promise<void>;
}

/** The request logger, as far as the brief module uses it. */
export interface BriefLog {
  info(fields: Record<string, unknown>, message: string): void;
}

/** `container.intent`, as far as the brief module uses it: a read, never a derivation (R-SRV-27). */
export interface BriefIntentSource {
  get(
    workspaceId: string,
    prId: string,
  ): Promise<{ summary: string; in_scope: string[]; out_of_scope: string[]; stale: boolean } | null>;
}

/** `container.blast`. */
export interface BriefBlastSource {
  forPull(workspaceId: string, prId: string, log: BriefLog): Promise<BlastRadiusResponse>;
}

/** `container.projectContext`'s workspace-level read. */
export interface BriefDocumentSource {
  forWorkspace(input: {
    workspaceId: string;
    repo: { owner: string; name: string; clonePath: string | null };
  }): Promise<{
    /** Distinct attached paths, read or skipped; `0` means nothing is attached. */
    attached: number;
    notCloned: boolean;
    documents: { path: string; text: string }[];
  }>;
}
