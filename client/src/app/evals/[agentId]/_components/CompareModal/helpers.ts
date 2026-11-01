/* Pure helpers of the Compare modal: the cost change between two runs, whether the model or
   skills differ, whether the whole configuration is equal, and the cases whose outcome flipped. */
import type { EvalCaseOutcome, EvalConfigSnapshot } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format-cost";

const MINUS = "−"; // U+2212, the design's sign for a drop

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
