import type {
  EvalCaseMeta,
  EvalCaseRecord,
  EvalConfigSnapshot,
  EvalExpectation,
  EvalExpectationKind,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  FindingCategory,
  GitClient,
  Provider,
  ReviewStrategy,
  Severity,
} from '@devdigest/shared';
import type { ReviewInput, ReviewOutcome } from '@devdigest/reviewer-core';
import type { PromptSkill } from '../_shared/review-prompt.js';

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

/** The agent's configuration as a run snapshots it (R-SRV-16). */
export interface EvalAgentSnapshot {
  name: string;
  version: number;
  systemPrompt: string;
  provider: Provider;
  model: string;
  strategy: ReviewStrategy;
}

/** The values of a new run; the id, status and `started_at` come from the insert. */
export interface NewEvalRun {
  workspaceId: string;
  agentId: string;
  agentName: string;
  config: EvalConfigSnapshot;
  casesTotal: number;
}

/** One scored case, as the executor hands it to the store. */
export interface EvalResultRow {
  caseId: string;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  actualOutput: { findings: { matches: boolean }[]; dropped: number } | null;
  durationMs: number;
  costUsd: number | null;
  error: string | null;
}

/** A stored case result with its case's kind — what the aggregate is computed from. */
export interface EvalStoredResult {
  case_id: string;
  kind: EvalExpectationKind;
  error: string | null;
  pass: boolean | null;
  actual_output: { findings: { matches: boolean }[]; dropped: number } | null;
  cost_usd: number | null;
}

/** How a run ends: the aggregate of its stored rows, or a failure message. */
export type EvalRunFinish =
  | {
      recall: number | null;
      precision: number | null;
      citation_accuracy: number | null;
      cases_passed: number;
      cases_errored: number;
      cost_usd: number | null;
    }
  | { failed: string; cases_errored?: number };

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

  // ---- runs --------------------------------------------------------------

  countCases(agentId: string): Promise<number>;
  /** The agent's cases for a run, oldest first. */
  casesForRun(agentId: string): Promise<EvalCaseRecord[]>;
  /** Workspace-scoped; `undefined` for an unknown or foreign agent. */
  agentSnapshot(workspaceId: string, agentId: string): Promise<EvalAgentSnapshot | undefined>;
  /** The agent's enabled linked skills in prompt order. */
  promptSkills(agentId: string): Promise<PromptSkill[]>;
  hasRunningRun(agentId: string): Promise<boolean>;
  /** `'conflict'` when the agent already has a running run (the partial unique index). */
  insertRun(values: NewEvalRun): Promise<EvalSuiteRun | 'conflict'>;
  /**
   * Insert the case's result and bump `cases_done` in one transaction. `'case_gone'`: the case was
   * deleted; `'run_gone'`: the run (its agent) was deleted. Nothing is written in either.
   */
  storeResult(runId: string, row: EvalResultRow): Promise<'stored' | 'case_gone' | 'run_gone'>;
  resultsOf(runId: string): Promise<EvalStoredResult[]>;
  /** Sets the end state; `false` when the run row is gone. */
  finishRun(runId: string, finish: EvalRunFinish): Promise<boolean>;
  /** A page of the agent's runs, newest first, with the total. */
  listRuns(
    workspaceId: string,
    agentId: string,
    limit: number,
    offset: number,
  ): Promise<{ runs: EvalSuiteRun[]; total: number }>;
  runDetail(workspaceId: string, runId: string): Promise<EvalSuiteRunDetail | undefined>;
  /** Boot reap: every `running` run becomes `failed`. Returns the count. */
  reapRunning(): Promise<number>;
}

/** What the run executor needs from the store. */
export type EvalExecutorStore = Pick<EvalStore, 'storeResult' | 'resultsOf' | 'finishRun'>;

/** `reviewPullRequest()` of `@devdigest/reviewer-core`, as the executor takes it. */
export type ReviewEngine = (input: ReviewInput) => Promise<ReviewOutcome>;

/** The request logger, as far as the eval module uses it. */
export interface EvalLog {
  info(fields: Record<string, unknown>, message: string): void;
}

/** `container.git`, as far as the eval module uses it. */
export type EvalGit = Pick<GitClient, 'diff'>;
