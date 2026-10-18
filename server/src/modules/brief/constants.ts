/**
 * Named constants of the PR Brief (`server/specs/L05-pr-brief.md`, "Configuration and limits").
 * Constants of the module, not environment settings.
 */

/** Tokens (`cl100k_base`, system and user message together) the model call may carry. */
export const INPUT_BUDGET_TOKENS = 8000;
/** `maxTokens` of the one structured call. */
export const OUTPUT_MAX_TOKENS = 2000;
export const CALL_TIMEOUT_MS = 60_000;
/** `maxRetries` of the structured call: one repair attempt. */
export const MAX_REPAIR_RETRIES = 1;
/** Non-dismissed findings of the latest completed review that reach the prompt. */
export const MAX_REVIEW_FINDINGS = 20;
export const ISSUE_BODY_CUT_TOKENS = 1000;
export const DESCRIPTION_CUT_TOKENS = 1500;
export const MAX_RISKS = 6;
export const MAX_REVIEW_FOCUS = 6;
export const SUMMARY_MAX_CHARS = 600;
export const BRIEF_SCHEMA_NAME = 'PrBriefDraft';
