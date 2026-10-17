/**
 * Project Context constants (L05). Limits are enforced by the service and the
 * run; the token caps are also returned to the client.
 */

/** A document larger than this is listed as `too_large` and never read. */
export const MAX_CONTEXT_DOC_BYTES = 102_400;

/** The list route returns at most this many documents, sorted by path. */
export const MAX_CONTEXT_DOCS = 1000;

/** The most paths one agent or skill may attach (also the contract's `.max`). */
export const MAX_CONTEXT_PATHS = 200;

/** Attached tokens above this show a warning in the client. */
export const CONTEXT_SOFT_CAP_TOKENS = 4000;

/** The most document tokens one review run inserts; later documents are `over_cap`. */
export const CONTEXT_RUN_CAP_TOKENS = 16_000;

/**
 * Directories the discovery walk never enters. The same set as repo-intel's
 * `EXCLUDED_DIRS`, declared here because a module never imports another module.
 */
export const CONTEXT_EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
] as const;
