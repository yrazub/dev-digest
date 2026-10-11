import type { IconName } from "@devdigest/ui";
import type { BlastTotals } from "@devdigest/shared";

/** Icon of the block's section label. */
export const BLAST_ICON: IconName = "Workflow";

/** The four summary stats, in display order: the `totals` key, its icon and its `blast.stat.*` label key. */
export const BLAST_STATS: ReadonlyArray<{ key: keyof BlastTotals; icon: IconName }> = [
  { key: "symbols", icon: "Code" },
  { key: "callers", icon: "CornerDownRight" },
  { key: "endpoints", icon: "Globe" },
  { key: "crons", icon: "Clock" },
];

/** Chip look per kind of fact in the calling files; the icon always accompanies the text. */
export const CHIP_TONE = {
  endpoint: { icon: "Globe", color: "var(--accent-text)", bg: "var(--accent-bg)" },
  cron: { icon: "Clock", color: "var(--warn)", bg: "var(--warn-bg)" },
} as const satisfies Record<string, { icon: IconName; color: string; bg: string }>;

/** Keys of the placeholder rows of the loading state. */
export const SKELETON_ROWS = ["first", "second", "third"] as const;

/** Symbol kinds that read as a call, so their name is followed by `()`. */
export const CALLABLE_KINDS: ReadonlySet<string> = new Set(["function", "method"]);
