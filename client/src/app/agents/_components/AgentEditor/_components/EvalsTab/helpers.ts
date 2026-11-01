/* Pure helpers of the Evals tab: a case's location line, its outcome in the latest done run,
   how many cases pass, and whether Delete is blocked. */
import type { EvalCaseOutcome, EvalCaseRecord, EvalSuiteRun, EvalSuiteRunDetail } from "@devdigest/shared";

/** `<file>:<start>-<end> — <title>`; `<file>:<line> — <title>` when start equals end (R-WEB-10). */
export function caseLocation(c: Pick<EvalCaseRecord, "expected_output">): string {
  const { file, start_line, end_line, title } = c.expected_output;
  const where = start_line === end_line ? `${file}:${start_line}` : `${file}:${start_line}-${end_line}`;
  return `${where} — ${title}`;
}

/** The outcome of each case in one run, by case id. A case with no result is absent ("never run"). */
export function outcomeByCase(
  detail: Pick<EvalSuiteRunDetail, "results"> | null | undefined,
): ReadonlyMap<string, EvalCaseOutcome> {
  const out = new Map<string, EvalCaseOutcome>();
  for (const r of detail?.results ?? []) out.set(r.case_id, r.outcome);
  return out;
}

/** How many of the listed cases pass in the given outcomes. */
export function passingCount(
  cases: readonly Pick<EvalCaseRecord, "id">[],
  outcomes: ReadonlyMap<string, EvalCaseOutcome>,
): number {
  return cases.filter((c) => outcomes.get(c.id) === "pass").length;
}

/** R-WEB-57: Delete is disabled while any run of the agent is `running`. */
export function deleteDisabled(runs: readonly Pick<EvalSuiteRun, "status">[]): boolean {
  return runs.some((r) => r.status === "running");
}
