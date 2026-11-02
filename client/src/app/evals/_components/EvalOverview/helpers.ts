/* Pure helpers of the eval overview. */
import type { EvalSuiteRun } from "@devdigest/shared";
import { formatRunTime, sparkValues } from "@/components/eval/helpers";

/** The recall trend as sparkline points: null points are dropped; a single point is repeated once
    so the vendored `Sparkline` (which divides by `length − 1`) draws a flat line. */
export function sparklinePoints(trend: readonly (number | null)[]): number[] {
  return sparkValues(trend);
}

/** The values of `dashboard.lastRun` for an agent's latest done run. */
export function lastRunParams(latest: Pick<EvalSuiteRun, "started_at" | "config" | "cases_passed" | "cases_total">) {
  return {
    version: latest.config.agent_version,
    time: formatRunTime(latest.started_at),
    passed: latest.cases_passed,
    total: latest.cases_total,
  };
}
