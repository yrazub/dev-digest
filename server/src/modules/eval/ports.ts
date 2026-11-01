import type {
  EvalCaseMeta,
  EvalCaseRecord,
  EvalExpectation,
  FindingCategory,
  GitClient,
  Severity,
} from '@devdigest/shared';

/**
 * Ports of the eval service. The Drizzle implementation of `EvalStore` is `repository.ts`.
 * Structural types only — no Drizzle row type crosses this line, and no other module is imported.
 */

/** A finding with the review, pull request and repository it belongs to. */
export interface EvalFindingSource {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  title: string;
  severity: Severity;
  category: FindingCategory;
  accepted: boolean;
  dismissed: boolean;
  /** `reviews.agent_id` — null for a review no agent produced. */
  agentId: string | null;
  pull: {
    id: string;
    number: number;
    title: string;
    body: string | null;
    author: string;
    base: string;
    headSha: string;
  };
  repo: { owner: string; name: string };
}

/** The values of a new case; the id and `created_at` come from the database. */
export interface NewEvalCase {
  workspaceId: string;
  agentId: string;
  name: string;
  inputDiff: string;
  inputFiles: string[];
  inputMeta: EvalCaseMeta;
  expected: EvalExpectation;
  sourceFindingId: string;
}

export interface EvalStore {
  /** Workspace-scoped through the finding's review; `undefined` for an unknown or foreign finding. */
  findFindingSource(workspaceId: string, findingId: string): Promise<EvalFindingSource | undefined>;
  agentExists(workspaceId: string, agentId: string): Promise<boolean>;
  caseBySourceFinding(findingId: string): Promise<EvalCaseRecord | undefined>;
  /** `created: false` with the existing record when the finding already has a case. */
  insertCase(values: NewEvalCase): Promise<{ record: EvalCaseRecord; created: boolean }>;
  /** An agent's cases, newest first. */
  listCases(agentId: string): Promise<EvalCaseRecord[]>;
  /** `false` when nothing in the workspace matched. */
  deleteCase(workspaceId: string, caseId: string): Promise<boolean>;
  /** The pull request's stored changed files, ordered by path. */
  prPatches(prId: string): Promise<{ path: string; patch: string | null }[]>;
}

/** The request logger, as far as the eval module uses it. */
export interface EvalLog {
  info(fields: Record<string, unknown>, message: string): void;
}

/** `container.git`, as far as the eval module uses it. */
export type EvalGit = Pick<GitClient, 'diff'>;
