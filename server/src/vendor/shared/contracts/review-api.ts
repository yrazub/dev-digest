import { z } from 'zod';
import { Finding, Verdict } from './findings.js';
import {
  BlastRadius,
  Intent,
  IntentConfidence,
  IntentRiskArea,
  IntentSource,
  PrBrief,
  SmartDiff,
} from './brief.js';

/**
 * A2 — Review-Core API surface contracts. These extend the core
 * Review/Finding/Intent/SmartDiff contracts with the persisted/transport shapes
 * the reviewer endpoints return. A2 owns this file; the barrel re-exports it.
 *
 * Distinct from `Finding` (the raw LLM-output unit): `FindingRecord` adds the
 * persisted row identity + action timestamps so the UI can render accept/dismiss
 * state and the `review_id` it belongs to.
 */

export const FindingRecord = Finding.extend({
  review_id: z.string(),
  accepted_at: z.string().nullable(),
  dismissed_at: z.string().nullable(),
});
export type FindingRecord = z.infer<typeof FindingRecord>;

/** A persisted review with its kept findings + grounding summary. */
export const ReviewRecord = z.object({
  id: z.string(),
  pr_id: z.string(),
  agent_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_name: z.string().nullish(),
  kind: z.enum(['summary', 'review']),
  verdict: Verdict.nullable(),
  summary: z.string().nullable(),
  score: z.number().int().nullable(),
  model: z.string().nullable(),
  grounding: z.string().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRecord),
});
export type ReviewRecord = z.infer<typeof ReviewRecord>;

/**
 * Response of `POST /pulls/:id/review`. Each requested agent produces a run that
 * streams over SSE at `/runs/:runId/events`; clients subscribe per run. The
 * persisted reviews are also returned once the (synchronous) run completes.
 */
export const ReviewRunTarget = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
});
export type ReviewRunTarget = z.infer<typeof ReviewRunTarget>;

export const ReviewRunResponse = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTarget),
  reviews: z.array(ReviewRecord),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

/** Intent persisted for a PR: the Intent plus the pr_id it scopes and how it was derived. */
export const PrIntentRecord = Intent.extend({
  pr_id: z.string(),
  risk_areas: z.array(IntentRiskArea),
  confidence: IntentConfidence,
  sources: z.array(IntentSource),
  missing_context: z.boolean(),
  injection_suspected: z.boolean(),
  stale: z.boolean(),
  model: z.string().nullable(),
  cost_usd: z.number().nullable(),
  computed_at: z.string(),
});
export type PrIntentRecord = z.infer<typeof PrIntentRecord>;

/** Response of `GET`/`POST /pulls/:id/intent`; null until an intent was derived. */
export const PrIntentResponse = z.object({ intent: PrIntentRecord.nullable() });
export type PrIntentResponse = z.infer<typeof PrIntentResponse>;

/** Smart-diff response for a PR (the SmartDiff). */
export const SmartDiffResponse = SmartDiff;
export type SmartDiffResponse = z.infer<typeof SmartDiffResponse>;

/** Why a blast-radius map may be incomplete; the first five are the repo-intel facade's reasons. */
export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
  'pr_files_missing',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

/** Counts over the whole map, stated before any list is cut. */
export const BlastTotals = z.object({
  symbols: z.number().int().nonnegative(),
  callers: z.number().int().nonnegative(),
  endpoints: z.number().int().nonnegative(),
  crons: z.number().int().nonnegative(),
  symbols_without_callers: z.number().int().nonnegative(),
});
export type BlastTotals = z.infer<typeof BlastTotals>;

/** Response of `GET /pulls/:id/blast`. */
export const BlastRadiusResponse = BlastRadius.extend({
  totals: BlastTotals,
  degraded: z.boolean(),
  reason: BlastDegradedReason.nullable(), // null exactly when degraded is false
  indexed_sha: z.string().nullable(), // the commit the line numbers refer to
  caller_limit: z.number().int().positive(),
});
export type BlastRadiusResponse = z.infer<typeof BlastRadiusResponse>;

/** The kinds of input a PR Brief model call is built from. */
export const BriefInputKind = z.enum([
  'intent',
  'blast_radius',
  'diff_stats',
  'description',
  'linked_issue',
  'spec_documents',
]);
export type BriefInputKind = z.infer<typeof BriefInputKind>;

export const BriefInputStatus = z.enum(['used', 'trimmed', 'missing']);
export type BriefInputStatus = z.infer<typeof BriefInputStatus>;

export const BriefInputReason = z.enum([
  'not_derived',
  'stale', // intent
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
  'pr_files_missing', // blast
  'empty', // description
  'none_linked',
  'no_token',
  'not_found',
  'fetch_failed', // linked issue
  'none_attached',
  'not_cloned',
  'all_skipped', // spec documents
  'over_budget', // any trimmed input
]);
export type BriefInputReason = z.infer<typeof BriefInputReason>;

export const BriefInput = z.object({
  kind: BriefInputKind,
  status: BriefInputStatus,
  reason: BriefInputReason.nullable(), // null when used without a remark
  omitted: z.number().int().nonnegative().nullable(), // documents, callers or files left out
});
export type BriefInput = z.infer<typeof BriefInput>;

/** A persisted PR Brief with how it was generated; `stale` is computed on read, not stored. */
export const PrBriefRecord = PrBrief.extend({
  pr_id: z.string(),
  head_sha: z.string(),
  generated_at: z.string(),
  provider: z.string(),
  model: z.string(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  input_tokens: z.number().int().nullable(),
  input_budget_tokens: z.number().int().positive(),
  inputs: z.array(BriefInput),
  dropped: z.object({
    risks: z.number().int().nonnegative(),
    review_focus: z.number().int().nonnegative(),
  }),
  stale: z.boolean(),
});
export type PrBriefRecord = z.infer<typeof PrBriefRecord>;

/** Response of `GET`/`POST /pulls/:id/brief`; null until a brief was generated. */
export const PrBriefResponse = z.object({ brief: PrBriefRecord.nullable() });
export type PrBriefResponse = z.infer<typeof PrBriefResponse>;
