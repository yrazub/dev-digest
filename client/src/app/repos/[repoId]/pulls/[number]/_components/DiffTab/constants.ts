import type { SmartDiffRole } from "@devdigest/shared";

/**
 * Look and text keys of each role, keyed by the exact enum values. The role
 * order is NOT kept here: groups are rendered in the order the API returns them.
 * `labelKey` / `hintKey` are `prReview` message keys.
 */
export const ROLE_META: Record<
  SmartDiffRole,
  { color: string; labelKey: string; hintKey: string; startsCollapsed: boolean }
> = {
  core: {
    color: "var(--accent)",
    labelKey: "smartDiff.coreLabel",
    hintKey: "smartDiff.coreHint",
    startsCollapsed: false,
  },
  tests: {
    color: "var(--ok)",
    labelKey: "smartDiff.testsLabel",
    hintKey: "smartDiff.testsHint",
    startsCollapsed: false,
  },
  wiring: {
    color: "var(--pending)",
    labelKey: "smartDiff.wiringLabel",
    hintKey: "smartDiff.wiringHint",
    startsCollapsed: false,
  },
  docs: {
    color: "var(--text-secondary)",
    labelKey: "smartDiff.docsLabel",
    hintKey: "smartDiff.docsHint",
    startsCollapsed: true,
  },
  boilerplate: {
    color: "var(--stale)",
    labelKey: "smartDiff.boilerplateLabel",
    hintKey: "smartDiff.boilerplateHint",
    startsCollapsed: true,
  },
};

/** Stable keys for the placeholder rows shown while the grouping loads. */
export const SKELETON_ROW_KEYS = ["row-1", "row-2", "row-3"] as const;
