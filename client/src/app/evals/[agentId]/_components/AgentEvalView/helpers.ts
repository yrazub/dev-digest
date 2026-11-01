/* Pure helpers of the agent's eval view: the Compare selection, the precision-dip banner and
   the data of the metric cards and the trend chart. `runs` come newest first, as the API returns them. */
import type { EvalSuiteRun } from "@devdigest/shared";
import { deltaPoints, latestDone, orderPair, previousDone, sparkValues } from "@/components/eval";
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

/** A metric's values over the done runs, oldest first, for a sparkline (see `sparkValues`). */
export function metricSpark(runs: readonly EvalSuiteRun[], metric: TrendMetric): number[] {
  return sparkValues(
    runs
      .filter((r) => r.status === "done")
      .reverse()
      .map((r) => r[metric]),
  );
}

/** The ids of a `?compare=<a>,<b>` value; null unless it holds exactly two non-empty ids (R-WEB-53). */
export function parseCompareParam(value: string | null | undefined): [string, string] | null {
  if (!value) return null;
  const parts = value.split(",");
  const [a, b] = parts;
  if (parts.length !== 2 || !a || !b) return null;
  return [a, b];
}

type ComparableRun = Pick<EvalSuiteRun, "id" | "agent_id" | "status" | "started_at">;

/** The two run ids as [older, newer] when both are distinct done runs of this agent, else null
    — the only case in which the Compare modal opens from the URL (R-WEB-53). */
export function comparablePair(
  agentId: string,
  a: ComparableRun | undefined,
  b: ComparableRun | undefined,
): [string, string] | null {
  if (!a || !b || a.id === b.id) return null;
  if (a.status !== "done" || b.status !== "done") return null;
  if (a.agent_id !== agentId || b.agent_id !== agentId) return null;
  const [older, newer] = orderPair(a, b);
  return [older.id, newer.id];
}
