import { describe, it, expect } from "vitest";
import type { EvalCaseRecord, EvalSuiteRunDetail } from "@devdigest/shared";
import { caseLocation, deleteDisabled, outcomeByCase, passingCount } from "./helpers";

const expectation = (start_line: number, end_line: number) =>
  ({
    kind: "must_find",
    file: "src/auth.ts",
    start_line,
    end_line,
    title: "Hardcoded key",
    severity: "CRITICAL",
    category: "security",
  }) as EvalCaseRecord["expected_output"];

describe("caseLocation", () => {
  it("renders file:start-end for a range and file:line when start equals end", () => {
    expect(caseLocation({ expected_output: expectation(10, 14) })).toBe("src/auth.ts:10-14 — Hardcoded key");
    expect(caseLocation({ expected_output: expectation(7, 7) })).toBe("src/auth.ts:7 — Hardcoded key");
  });
});

describe("outcomeByCase and passingCount", () => {
  const detail = {
    results: [
      { case_id: "c1", outcome: "pass" },
      { case_id: "c2", outcome: "fail" },
      { case_id: "c3", outcome: "errored" },
    ],
  } as unknown as EvalSuiteRunDetail;

  it("maps each result to its case and counts only passes among the listed cases", () => {
    const outcomes = outcomeByCase(detail);
    expect(outcomes.get("c2")).toBe("fail");
    expect(outcomes.get("c4")).toBeUndefined();
    expect(passingCount([{ id: "c1" }, { id: "c2" }, { id: "c4" }], outcomes)).toBe(1);
  });

  it("is empty without a run", () => {
    expect(outcomeByCase(undefined).size).toBe(0);
    expect(outcomeByCase(null).size).toBe(0);
  });
});

describe("deleteDisabled", () => {
  it("is true only while some run is running", () => {
    expect(deleteDisabled([{ status: "done" }, { status: "failed" }])).toBe(false);
    expect(deleteDisabled([{ status: "done" }, { status: "running" }])).toBe(true);
    expect(deleteDisabled([])).toBe(false);
  });
});
