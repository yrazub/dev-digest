/* Pure helpers of the agent's eval view: the Compare selection, the precision-dip banner and
   the data of the metric cards and the trend chart. `runs` come newest first, as the API returns them. */
import type { EvalSuiteRun } from "@devdigest/shared";
import { deltaPoints, latestDone, previousDone } from "@/components/eval";
import { formatCostUsd } from "@/lib/format-cost";

export type TrendMetric = "recall" | "precision" | "citation_accuracy";

export interface TrendPoint {
  id: string;
  version: number;
  recall: number | null;
  precision: number | null;
  citation: number | null;
  cost: number | null;
}

/** Toggle a run in the selection: at most two stay, the earliest-selected is dropped by a third
    pick, and picking a selected run removes it (R-WEB-37). */
export function toggleSelection(selected: readonly string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  return [...selected, id].slice(-2);
}

/** The latest done run's precision against the previous done run's, as shown percentages
    (R-WEB-54). Null unless it dipped. */
export function precisionDip(runs: readonly EvalSuiteRun[]): { n: number; version: number } | null {
  const latest = latestDone(runs);
  const previous = previousDone(runs);
  if (!latest || !previous) return null;
  const delta = deltaPoints(latest.precision, previous.precision);
  if (delta === null || delta >= 0) return null;
  return { n: -delta, version: latest.config.agent_version };
}

/** The done runs, oldest first; null metrics stay null so the chart draws a gap (R-WEB-55). */
export function trendPoints(runs: readonly EvalSuiteRun[]): TrendPoint[] {
  return runs
    .filter((r) => r.status === "done")
    .reverse()
    .map((r) => ({
      id: r.id,
      version: r.config.agent_version,
      recall: r.recall,
      precision: r.precision,
      citation: r.citation_accuracy,
      cost: r.cost_usd,
    }));
}

/** The tooltip text of a trend point: "v3 · $0.0040" (R-WEB-55). */
export function trendTooltipLabel(point: Pick<TrendPoint, "version" | "cost">): string {
  return `v${point.version} · ${formatCostUsd(point.cost)}`;
}

/** A metric's values over the done runs, oldest first, for a sparkline: null points are dropped
    and a single point is repeated once so the vendored `Sparkline` (which divides by
    `length − 1`) draws a flat line. */
export function metricSpark(runs: readonly EvalSuiteRun[], metric: TrendMetric): number[] {
  const values = runs
    .filter((r) => r.status === "done")
    .reverse()
    .map((r) => r[metric])
    .filter((v): v is number => v != null);
  return values.length === 1 ? [values[0]!, values[0]!] : values;
}
