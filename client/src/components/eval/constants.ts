import type { IconName } from "@devdigest/ui";
import type { EvalCaseOutcome, EvalExpectationKind, EvalSuiteRunStatus } from "@devdigest/shared";

/** The enum values the UI needs, spelled out locally (the client takes only types from the contracts)
    and type-checked against them. */
export const EVAL_KINDS = ["must_find", "must_not_flag"] as const satisfies readonly EvalExpectationKind[];
export const RUN_STATUSES = ["running", "done", "failed"] as const satisfies readonly EvalSuiteRunStatus[];

export const METRIC_COLOR = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation: "var(--warn)",
} as const;

/** The icon of a case's outcome in the latest done run; `Dot` stands for "never run". */
export const OUTCOME_ICON: Record<EvalCaseOutcome, { icon: IconName; color: string }> = {
  pass: { icon: "CheckCircle", color: "var(--ok)" },
  fail: { icon: "XCircle", color: "var(--crit)" },
  errored: { icon: "AlertTriangle", color: "var(--warn)" },
};
export const NEVER_RUN_ICON = { icon: "Dot", color: "var(--text-muted)" } as const satisfies {
  icon: IconName;
  color: string;
};

export const KIND_PILL: Record<EvalExpectationKind, { color: string; bg: string; border: string }> = {
  must_find: { color: "var(--accent-text)", bg: "var(--accent-bg)", border: "var(--accent)" },
  must_not_flag: { color: "var(--text-muted)", bg: "var(--bg-hover)", border: "var(--border-strong)" },
};
