import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { countBySeverity, severityCounts, visibleFindings } from "./helpers";

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f",
    severity: "CRITICAL",
    category: "security",
    title: "t",
    file: "f.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

describe("countBySeverity", () => {
  it("tallies findings by severity", () => {
    const findings = [
      finding({ id: "1", severity: "CRITICAL" }),
      finding({ id: "2", severity: "CRITICAL" }),
      finding({ id: "3", severity: "WARNING" }),
    ];
    expect(countBySeverity(findings)).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 });
  });

  it("is all-zero for no findings", () => {
    expect(countBySeverity([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });
});

describe("severityCounts", () => {
  it("orders CRITICAL → WARNING → SUGGESTION and drops zero counts", () => {
    expect(severityCounts({ CRITICAL: 0, WARNING: 2, SUGGESTION: 1 })).toEqual([
      ["WARNING", 2],
      ["SUGGESTION", 1],
    ]);
  });

  it("returns an empty list for null/undefined input", () => {
    expect(severityCounts(null)).toEqual([]);
    expect(severityCounts(undefined)).toEqual([]);
  });
});

describe("visibleFindings", () => {
  const findings = [
    finding({ id: "1", severity: "WARNING", confidence: 0.9 }),
    finding({ id: "2", severity: "CRITICAL", confidence: 0.5 }),
    finding({ id: "3", severity: "SUGGESTION", confidence: 0.9 }),
  ];

  it("sorts by severity with no filters", () => {
    expect(visibleFindings(findings, false, null).map((f) => f.id)).toEqual(["2", "1", "3"]);
  });

  it("narrows to one severity when sevFilter is set", () => {
    expect(visibleFindings(findings, false, "WARNING").map((f) => f.id)).toEqual(["1"]);
  });

  it("composes hideLow and sevFilter (AND)", () => {
    // "2" is CRITICAL but below the confidence threshold — hidden by hideLow
    // even though it matches the severity filter.
    expect(visibleFindings(findings, true, "CRITICAL")).toEqual([]);
  });
});
