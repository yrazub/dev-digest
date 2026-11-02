import { z } from 'zod';
import { Severity, FindingCategory } from './findings.js';
import { EvalCase, Provider, ReviewStrategy } from './knowledge.js';
import { EvalRunRecord } from './eval-ci.js';

/**
 * Eval pipeline contracts (L06): eval cases built from decided findings, background
 * suite runs with a stored configuration snapshot, per-case results and the dashboard.
 *
 * These EXTEND the barrel; `knowledge.ts` and `eval-ci.ts` are not edited. The client keeps
 * a byte-identical copy of this file (`test/contracts-sync.test.ts`).
 */

// ===========================================================================
// Eval cases
// ===========================================================================

export const EvalExpectationKind = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationKind = z.infer<typeof EvalExpectationKind>;

const EvalLocation = {
  file: z.string().min(1),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  title: z.string().min(1),
  severity: Severity,
  category: FindingCategory,
};
export const EvalExpectation = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('must_find'), ...EvalLocation }),
    z.object({ kind: z.literal('must_not_flag'), ...EvalLocation }),
  ])
  .refine((e) => e.start_line <= e.end_line, { message: 'start_line must be ≤ end_line' });
export type EvalExpectation = z.infer<typeof EvalExpectation>;

export const EvalCaseMeta = z.object({
  pr_id: z.string(),
  pr_number: z.number().int(),
  repo: z.string(), // "owner/name"
  pr_title: z.string(),
  pr_body: z.string().nullable(),
  pr_author: z.string(),
  head_sha: z.string(),
});
export type EvalCaseMeta = z.infer<typeof EvalCaseMeta>;

export const EvalCaseRecord = EvalCase.extend({
  owner_kind: z.literal('agent'),
  input_meta: EvalCaseMeta,
  expected_output: EvalExpectation,
  source_finding_id: z.string().nullable(), // null once the finding is deleted, and for seeded cases
  created_at: z.string(),
});
export type EvalCaseRecord = z.infer<typeof EvalCaseRecord>;

export const EvalCaseCreateResponse = z.object({ case: EvalCaseRecord, created: z.boolean() });
export type EvalCaseCreateResponse = z.infer<typeof EvalCaseCreateResponse>;

export const EvalCaseList = z.object({ cases: z.array(EvalCaseRecord) });
export type EvalCaseList = z.infer<typeof EvalCaseList>;

// ===========================================================================
// Eval suite runs
// ===========================================================================

export const EvalSuiteRunStatus = z.enum(['running', 'done', 'failed']);
export type EvalSuiteRunStatus = z.infer<typeof EvalSuiteRunStatus>;

export const EvalSkillRef = z.object({ name: z.string(), version: z.number().int() });
export type EvalSkillRef = z.infer<typeof EvalSkillRef>;

export const EvalConfigSnapshot = z.object({
  agent_version: z.number().int(),
  system_prompt: z.string(),
  provider: Provider,
  model: z.string(),
  strategy: ReviewStrategy,
  skills: z.array(EvalSkillRef),
});
export type EvalConfigSnapshot = z.infer<typeof EvalConfigSnapshot>;

const Metric = z.number().min(0).max(1).nullable();
export const EvalSuiteRun = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  status: EvalSuiteRunStatus,
  config: EvalConfigSnapshot,
  recall: Metric,
  precision: Metric,
  citation_accuracy: Metric,
  cases_total: z.number().int(),
  cases_done: z.number().int(),
  cases_passed: z.number().int(),
  cases_errored: z.number().int(),
  cost_usd: z.number().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  error: z.string().nullable(),
});
export type EvalSuiteRun = z.infer<typeof EvalSuiteRun>;

export const EvalSuiteRunList = z.object({ runs: z.array(EvalSuiteRun), total: z.number().int() });
export type EvalSuiteRunList = z.infer<typeof EvalSuiteRunList>;

// ===========================================================================
// Per-case results
// ===========================================================================

export const EvalCaseOutcome = z.enum(['pass', 'fail', 'errored']);
export type EvalCaseOutcome = z.infer<typeof EvalCaseOutcome>;

export const EvalFoundFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  severity: Severity,
  category: FindingCategory,
  matches: z.boolean(), // overlaps this case's expectation (R-SRV-19)
});
export type EvalFoundFinding = z.infer<typeof EvalFoundFinding>;

export const EvalCaseResult = EvalRunRecord.extend({
  suite_run_id: z.string(),
  case_name: z.string(),
  kind: EvalExpectationKind,
  expectation: EvalExpectation,
  outcome: EvalCaseOutcome,
  actual_output: z.object({ findings: z.array(EvalFoundFinding), dropped: z.number().int() }).nullable(),
  error: z.string().nullable(),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

export const EvalSuiteRunDetail = EvalSuiteRun.extend({ results: z.array(EvalCaseResult) });
export type EvalSuiteRunDetail = z.infer<typeof EvalSuiteRunDetail>;

// ===========================================================================
// Dashboard
// ===========================================================================

export const EvalAgentOverview = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  provider: Provider,
  model: z.string(),
  enabled: z.boolean(),
  cases_total: z.number().int(),
  runs_total: z.number().int(),
  running: z.boolean(),
  latest: EvalSuiteRun.nullable(), // latest done run
  recall_trend: z.array(Metric), // last 10 done runs, oldest first
});
export type EvalAgentOverview = z.infer<typeof EvalAgentOverview>;

export const EvalOverview = z.object({
  agents: z.array(EvalAgentOverview),
  recent_runs: z.array(EvalSuiteRun), // 6 newest, any status
});
export type EvalOverview = z.infer<typeof EvalOverview>;
