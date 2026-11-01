/* Pure helpers of the eval surfaces: percentages, deltas in points, run times and the
   picks of "latest / previous done run" that the metric cards and strips share. */
import type { EvalSuiteRun } from "@devdigest/shared";

const MINUS = "−"; // U+2212, the design's sign for a drop

/** A 0..1 metric as "NN%"; an em-dash when unknown (R-WEB-39, R-WEB-49). */
export function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

/** `round(new × 100) − round(old × 100)`; null when either side is unknown (R-WEB-32, R-WEB-39). */
export function deltaPoints(newV: number | null | undefined, oldV: number | null | undefined): number | null {
  if (newV == null || oldV == null) return null;
  return Math.round(newV * 100) - Math.round(oldV * 100);
}

/** "▲ +12pt" / "▼ −8pt" / "±0pt". */
export function deltaText(n: number): string {
  if (n > 0) return `▲ +${n}pt`;
  if (n < 0) return `▼ ${MINUS}${Math.abs(n)}pt`;
  return "±0pt";
}

const two = (n: number) => String(n).padStart(2, "0");

/** An ISO instant as local `YYYY-MM-DD HH:mm` (Q11). */
export function formatRunTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** The accessible name of a run's checkbox (R-WEB-48): `YYYY-MM-DD HH:mm · v<n>`. */
export function runCheckboxLabel(run: Pick<EvalSuiteRun, "started_at" | "config">): string {
  return `${formatRunTime(run.started_at)} · v${run.config.agent_version}`;
}

/** `runs` come newest first, as the API returns them. */
export function latestDone<R extends Pick<EvalSuiteRun, "status">>(runs: readonly R[]): R | null {
  return runs.find((r) => r.status === "done") ?? null;
}

export function previousDone<R extends Pick<EvalSuiteRun, "status">>(runs: readonly R[]): R | null {
  return runs.filter((r) => r.status === "done")[1] ?? null;
}

export function runningRun<R extends Pick<EvalSuiteRun, "status">>(runs: readonly R[]): R | null {
  return runs.find((r) => r.status === "running") ?? null;
}
