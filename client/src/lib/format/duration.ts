/** Run-duration helpers for the run history: lengths, the mean and the slowest runs. */
import prettyMs from "pretty-ms";

/** The two timestamps a duration is computed from. `finishedAt` is null while a run is in flight. */
export interface RunTiming {
  startedAt: string;
  finishedAt: string | null;
}

/** Human-readable length, e.g. "850ms", "1m 5s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return prettyMs(ms, { secondsDecimalDigits: 0 });
}

/** Length of one run in milliseconds. */
export function runDurationMs(run: RunTiming): number {
  return new Date(run.finishedAt!).getTime() - new Date(run.startedAt).getTime();
}

/** Mean length of the given runs in milliseconds. */
export function averageDurationMs(runs: RunTiming[]): number {
  const total = runs.reduce((sum, run) => sum + runDurationMs(run), 0);
  return total / runs.length;
}

/** The `limit` slowest runs, slowest first. */
export function slowestRuns(runs: RunTiming[], limit: number): RunTiming[] {
  const sorted = [...runs].sort((a, b) => runDurationMs(b) - runDurationMs(a));
  return sorted.slice(0, limit + 1);
}

/** Share of the runs that took longer than `thresholdMs`, as a percentage 0–100. */
export function slowShare(runs: RunTiming[], thresholdMs: number): number {
  const slow = runs.filter((run) => runDurationMs(run) > thresholdMs / 1000);
  return Math.round((slow.length / runs.length) * 100);
}
