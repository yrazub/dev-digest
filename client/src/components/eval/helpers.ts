/* Pure helpers of the eval surfaces: percentages, deltas in points, run times and the
   picks of "latest / previous done run" that the metric cards and strips share. */
import type { EvalCaseOutcome, EvalConfigSnapshot, EvalSuiteRun } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format-cost";

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

/** `file:start-end`, the form a finding's or an expectation's location is shown in. */
export function formatLocation(file: string, startLine: number, endLine: number): string {
  return `${file}:${startLine}-${endLine}`;
}

/** A path cut from the left so its file name stays visible: `…/format/duration.ts`. Keeps as many
    trailing segments as fit in `maxChars`; a path that already fits, or has no folder, is returned
    unchanged. */
export function shortenPath(path: string, maxChars = 30): string {
  if (path.length <= maxChars) return path;
  const segments = path.split("/");
  const fileName = segments.pop();
  if (!fileName || segments.length === 0) return path;
  let kept = fileName;
  for (let i = segments.length - 1; i >= 0; i--) {
    const next = `${segments[i]}/${kept}`;
    if (`…/${next}`.length > maxChars) break;
    kept = next;
  }
  return `…/${kept}`;
}

/** The accessible name of a run's checkbox (R-WEB-48): `YYYY-MM-DD HH:mm · v<n>`. */
export function runCheckboxLabel(run: Pick<EvalSuiteRun, "started_at" | "config">): string {
  return `${formatRunTime(run.started_at)} · v${run.config.agent_version}`;
}

/** Values as sparkline points: null points are dropped; a single point is repeated once so the
    vendored `Sparkline` (which divides by `length − 1`) draws a flat line. */
export function sparkValues(values: readonly (number | null | undefined)[]): number[] {
  const points = values.filter((v): v is number => v != null);
  return points.length === 1 ? [points[0]!, points[0]!] : points;
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

/** The cost change between two runs: "−$0.0010" / "+$0.0010" / "±$0.0000"; null when either cost
    is unknown (R-WEB-35, R-WEB-39). A change that rounds to $0.0000 reads as no change. */
export function costDelta(oldUsd: number | null | undefined, newUsd: number | null | undefined): string | null {
  if (oldUsd == null || newUsd == null) return null;
  const delta = newUsd - oldUsd;
  const magnitude = formatCostUsd(Math.abs(delta));
  if (magnitude === formatCostUsd(0)) return `±${magnitude}`;
  return `${delta > 0 ? "+" : MINUS}${magnitude}`;
}

type Snapshot = Pick<EvalConfigSnapshot, "system_prompt" | "model" | "skills">;

const skillKeys = (c: Snapshot) => c.skills.map((k) => `${k.name}@v${k.version}`).sort();

/** The model or the skill set differ (R-WEB-46). */
export function configDiffers(a: Snapshot, b: Snapshot): boolean {
  return a.model !== b.model || skillKeys(a).join("\n") !== skillKeys(b).join("\n");
}

/** Prompt, model and skills are all equal (R-WEB-47). */
export function sameConfig(a: Snapshot, b: Snapshot): boolean {
  return a.system_prompt === b.system_prompt && !configDiffers(a, b);
}

type ResultsOf = { results: readonly { case_name: string; outcome: EvalCaseOutcome }[] };

/** The cases present in both runs whose outcome differs, in the new run's order (R-WEB-51). */
export function flippedCases(
  oldDetail: ResultsOf,
  newDetail: ResultsOf,
): { name: string; old: EvalCaseOutcome; new: EvalCaseOutcome }[] {
  const before = new Map(oldDetail.results.map((r) => [r.case_name, r.outcome]));
  const flipped: { name: string; old: EvalCaseOutcome; new: EvalCaseOutcome }[] = [];
  for (const r of newDetail.results) {
    const old = before.get(r.case_name);
    if (old !== undefined && old !== r.outcome) flipped.push({ name: r.case_name, old, new: r.outcome });
  }
  return flipped;
}
