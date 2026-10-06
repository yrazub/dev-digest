import type {
  FeatureModelChoice,
  IntentConfidence,
  IntentRiskArea,
  IntentSource,
  Provider,
} from '@devdigest/shared';

/**
 * Persistence port for the intent service. The Drizzle implementation is
 * `repository.ts`; tests fake it without Postgres. Structural types only — no
 * Drizzle row types cross this line.
 */

/** The pull request the classifier reads: its facts, its repository and its files. */
export interface IntentPullContext {
  pull: {
    id: string;
    number: number;
    title: string;
    body: string | null;
    branch: string;
    base: string;
    headSha: string;
  };
  repo: { owner: string; name: string };
  /** Path, line counts and the stored patch (hunk headers are cut from it). Empty unless requested. */
  files: { path: string; additions: number; deletions: number; patch: string | null }[];
}

/** What the service writes for one derivation (`pr_id` and `computed_at` are the store's). */
export interface IntentValues {
  summary: string;
  inScope: string[];
  outOfScope: string[];
  riskAreas: IntentRiskArea[];
  confidence: IntentConfidence;
  sources: IntentSource[];
  missingContext: boolean;
  injectionSuspected: boolean;
  /** Null for the seeded demo row. */
  sourceHash: string | null;
  provider: Provider | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

export interface StoredIntent extends IntentValues {
  prId: string;
  computedAt: Date;
}

/** A stored `pr_intent` row that failed its read parse: column names only, never stored values. */
export interface UnreadableIntent {
  prId: string;
  columns: string[];
}

export interface IntentReadOptions {
  /** Called once when the row exists but a column fails its contract; the store never logs. */
  onUnreadable?: (info: UnreadableIntent) => void;
}

export interface IntentStore {
  /** Workspace-scoped PR lookup; `undefined` for an unknown or foreign PR. Files only when `includeFiles`. */
  getPullContext(
    workspaceId: string,
    prId: string,
    opts?: { includeFiles?: boolean },
  ): Promise<IntentPullContext | undefined>;
  /** `undefined` means no row, or a row whose contract-shaped columns do not parse (reported through `opts.onUnreadable`). */
  getIntent(prId: string, opts?: IntentReadOptions): Promise<StoredIntent | undefined>;
  /** Insert or replace the PR's intent (keyed on `pr_id`); returns the written values and `computed_at`. No parse: the values already passed the classifier schema and the clamp. */
  upsertIntent(prId: string, values: IntentValues): Promise<StoredIntent>;
  /** The workspace's `settings.feature_models.review_intent` choice, `undefined` when unset or invalid. */
  featureModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined>;
}
