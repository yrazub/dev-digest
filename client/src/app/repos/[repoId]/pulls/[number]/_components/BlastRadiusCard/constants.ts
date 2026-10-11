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

/** The view lives in the URL: `?blast=graph` is the Graph view, no parameter (or any other value) is the Tree. */
export const BLAST_VIEW_PARAM = "blast";
export const BLAST_VIEW_GRAPH = "graph";

export type BlastView = "tree" | "graph";

/** Hand-computed sizes of the Graph view, in SVG user units. */
export interface GraphSizes {
  /** Left edge of each column, left to right: changed symbols, callers, endpoints and crons. */
  columnX: { caller: number; symbol: number; fact: number };
  nodeWidth: number;
  nodeHeight: number;
  /** Vertical space between two nodes of a column. */
  nodeGap: number;
  /** Space between the canvas edge and the nodes. */
  padding: number;
  /** Longest label shown whole; a longer one is cut and ends with an ellipsis. */
  labelMax: number;
}

export const GRAPH_SIZES: GraphSizes = {
  columnX: { symbol: 16, caller: 296, fact: 576 },
  nodeWidth: 220,
  nodeHeight: 30,
  nodeGap: 12,
  padding: 16,
  labelMax: 26,
};
