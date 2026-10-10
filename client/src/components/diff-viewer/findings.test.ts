import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import {
  findingLineKey,
  findingsForFile,
  isCounted,
  mostSevere,
  partitionFindings,
  sortBySeverity,
} from "./findings";

function finding(over: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "WARNING",
    category: "bug",
    title: `title ${over.id}`,
    file: "src/a.ts",
    start_line: 10,
    end_line: 10,
    rationale: "because",
    confidence: 0.9,
    review_id: "rev-1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

describe("isCounted", () => {
  it("is false only for a dismissed finding (an accepted one still counts)", () => {
    expect(isCounted(finding({ id: "a" }))).toBe(true);
    expect(isCounted(finding({ id: "b", accepted_at: "2026-10-01T00:00:00Z" }))).toBe(true);
    expect(isCounted(finding({ id: "c", dismissed_at: "2026-10-01T00:00:00Z" }))).toBe(false);
  });
});

describe("findingsForFile", () => {
  it("matches the path exactly", () => {
    const list = [
      finding({ id: "1", file: "src/a.ts" }),
      finding({ id: "2", file: "src/a.tsx" }),
      finding({ id: "3", file: "lib/src/a.ts" }),
      finding({ id: "4", file: "SRC/A.ts" }),
    ];
    expect(findingsForFile(list, "src/a.ts").map((f) => f.id)).toEqual(["1"]);
    expect(findingsForFile(list, "src/none.ts")).toEqual([]);
  });
});

describe("findingLineKey", () => {
  it("is RIGHT:<start_line>", () => {
    expect(findingLineKey(finding({ id: "1", start_line: 42 }))).toBe("RIGHT:42");
  });
});

describe("partitionFindings", () => {
  it("anchors a finding whose RIGHT:<start_line> is rendered and leaves the rest unanchored", () => {
    const onLine = finding({ id: "on", start_line: 5 });
    const offLine = finding({ id: "off", start_line: 99 });
    const { anchored, unanchored } = partitionFindings([onLine, offLine], new Set(["RIGHT:5", "RIGHT:6"]));
    expect([...anchored.keys()]).toEqual(["RIGHT:5"]);
    expect(anchored.get("RIGHT:5")).toEqual([onLine]);
    expect(unanchored).toEqual([offLine]);
  });

  it("makes every finding unanchored when the file has no rendered lines", () => {
    const list = [finding({ id: "1", start_line: 1 }), finding({ id: "2", start_line: 2 })];
    const { anchored, unanchored } = partitionFindings(list, new Set());
    expect(anchored.size).toBe(0);
    expect(unanchored.map((f) => f.id)).toEqual(["1", "2"]);
  });

  it("does not anchor to the old side of the diff", () => {
    const f = finding({ id: "1", start_line: 7 });
    const { anchored, unanchored } = partitionFindings([f], new Set(["LEFT:7"]));
    expect(anchored.size).toBe(0);
    expect(unanchored).toEqual([f]);
  });

  it("puts two findings on one line under one shared key", () => {
    const a = finding({ id: "a", start_line: 5 });
    const b = finding({ id: "b", start_line: 5, severity: "CRITICAL" });
    const { anchored, unanchored } = partitionFindings([a, b], new Set(["RIGHT:5"]));
    expect(anchored.size).toBe(1);
    expect(anchored.get("RIGHT:5")).toEqual([a, b]);
    expect(unanchored).toEqual([]);
  });

  it("returns empty buckets for no findings", () => {
    const { anchored, unanchored } = partitionFindings([], new Set(["RIGHT:1"]));
    expect(anchored.size).toBe(0);
    expect(unanchored).toEqual([]);
  });
});

describe("mostSevere", () => {
  it("picks CRITICAL over WARNING over SUGGESTION from a mixed list", () => {
    const s = finding({ id: "s", severity: "SUGGESTION" });
    const w = finding({ id: "w", severity: "WARNING" });
    const c = finding({ id: "c", severity: "CRITICAL" });
    expect(mostSevere([s, w, c])).toBe("CRITICAL");
    expect(mostSevere([s, w])).toBe("WARNING");
    expect(mostSevere([w, s])).toBe("WARNING");
  });

  it("returns the severity of a single item and null for an empty list", () => {
    expect(mostSevere([finding({ id: "s", severity: "SUGGESTION" })])).toBe("SUGGESTION");
    expect(mostSevere([])).toBeNull();
  });
});

describe("sortBySeverity", () => {
  it("puts the most severe first, keeps equal severities in order, and does not mutate the input", () => {
    const list = [
      finding({ id: "s1", severity: "SUGGESTION" }),
      finding({ id: "w1", severity: "WARNING" }),
      finding({ id: "c1", severity: "CRITICAL" }),
      finding({ id: "w2", severity: "WARNING" }),
    ];
    const sorted = sortBySeverity(list);
    expect(sorted.map((f) => f.id)).toEqual(["c1", "w1", "w2", "s1"]);
    expect(list.map((f) => f.id)).toEqual(["s1", "w1", "c1", "w2"]);
  });
});
