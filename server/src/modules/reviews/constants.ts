/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

/**
 * The longest one agent run may take. Past it the in-flight model call is
 * aborted and the run is marked failed, so a provider that never finishes
 * cannot leave a run "running" indefinitely.
 */
export const RUN_DEADLINE_MS = 10 * 60_000;
