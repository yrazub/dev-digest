import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffGroup } from "@devdigest/shared";
import { countedInDiff, findingsOfLatestReviews, groupFindingMark, joinGroups } from "./helpers";

function finding(id: string, over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id,
    severity: "WARNING",
    category: "bug",
    title: `Title ${id}`,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "because",
    confidence: 0.9,
    review_id: "r",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

function review(
  id: string,
  agent_id: string | null,
  created_at: string,
  findings: FindingRecord[],
): ReviewRecord {
  return {
    id,
    pr_id: "pr1",
    agent_id,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at,
    findings,
  };
}

const ids = (list: FindingRecord[]) => list.map((f) => f.id).sort();

describe("findingsOfLatestReviews", () => {
  it("gives an empty list for no reviews", () => {
    expect(findingsOfLatestReviews([])).toEqual([]);
  });

  it("takes only the newest review of an agent", () => {
    const old = review("r-old", "a1", "2026-10-01T10:00:00Z", [finding("old")]);
    const mid = review("r-mid", "a1", "2026-10-02T10:00:00Z", [finding("mid")]);
    const newest = review("r-new", "a1", "2026-10-03T10:00:00Z", [finding("new-1"), finding("new-2")]);
    expect(ids(findingsOfLatestReviews([mid, newest, old]))).toEqual(["new-1", "new-2"]);
  });

  it("takes the newest review of each agent", () => {
    const reviews = [
      review("a1-old", "a1", "2026-10-01T10:00:00Z", [finding("a1-old")]),
      review("a1-new", "a1", "2026-10-03T10:00:00Z", [finding("a1-new")]),
      review("a2-old", "a2", "2026-10-02T10:00:00Z", [finding("a2-old")]),
      review("a2-new", "a2", "2026-10-02T12:00:00Z", [finding("a2-new")]),
    ];
    expect(ids(findingsOfLatestReviews(reviews))).toEqual(["a1-new", "a2-new"]);
  });

  it("treats reviews with a null agent_id as one agent", () => {
    const reviews = [
      review("n-old", null, "2026-10-01T10:00:00Z", [finding("n-old")]),
      review("n-new", null, "2026-10-02T10:00:00Z", [finding("n-new")]),
      review("a1", "a1", "2026-10-01T09:00:00Z", [finding("a1")]),
    ];
    expect(ids(findingsOfLatestReviews(reviews))).toEqual(["a1", "n-new"]);
  });

  it("keeps dismissed findings", () => {
    const dismissed = finding("d", { dismissed_at: "2026-10-04T00:00:00Z" });
    const result = findingsOfLatestReviews([
      review("r", "a1", "2026-10-03T10:00:00Z", [dismissed, finding("kept")]),
    ]);
    expect(ids(result)).toEqual(["d", "kept"]);
  });

  it("picks the same findings whatever the order of reviews with different times", () => {
    const a1Old = review("a1-old", "a1", "2026-10-01T10:00:00Z", [finding("a1-old")]);
    const a1New = review("a1-new", "a1", "2026-10-03T10:00:00Z", [finding("a1-new")]);
    const nOld = review("n-old", null, "2026-10-01T10:00:00Z", [finding("n-old")]);
    const nNew = review("n-new", null, "2026-10-02T10:00:00Z", [finding("n-new")]);
    const expected = ["a1-new", "n-new"];
    expect(ids(findingsOfLatestReviews([a1Old, a1New, nOld, nNew]))).toEqual(expected);
    expect(ids(findingsOfLatestReviews([nNew, nOld, a1New, a1Old]))).toEqual(expected);
    expect(ids(findingsOfLatestReviews([a1New, nNew, a1Old, nOld]))).toEqual(expected);
  });

  // Plan, Design -> "Server shapes": "When two reviews of one agent have the same `createdAt`,
  // the one earlier in the input wins (the repository returns newest first)." So on a tie the
  // result does depend on the input order; this is the rule, not a defect.
  it("on equal created_at lets the review earlier in the input win", () => {
    const first = review("first", "a1", "2026-10-03T10:00:00Z", [finding("first")]);
    const second = review("second", "a1", "2026-10-03T10:00:00Z", [finding("second")]);
    expect(ids(findingsOfLatestReviews([first, second]))).toEqual(["first"]);
    expect(ids(findingsOfLatestReviews([second, first]))).toEqual(["second"]);
  });
});

describe("countedInDiff", () => {
  const files: PrFile[] = [
    { path: "src/a.ts", additions: 1, deletions: 0, patch: null },
    { path: "src/b.ts", additions: 1, deletions: 0, patch: null },
  ];

  it("counts the findings that are not dismissed and sit in a file of the PR", () => {
    const list = [
      finding("a", { file: "src/a.ts" }),
      finding("b", { file: "src/b.ts", accepted_at: "2026-10-04T00:00:00Z" }),
    ];
    expect(countedInDiff(list, files)).toBe(2);
  });

  it("does not count dismissed findings or findings of a file outside the PR", () => {
    const list = [
      finding("counted", { file: "src/a.ts" }),
      finding("dismissed", { file: "src/b.ts", dismissed_at: "2026-10-04T00:00:00Z" }),
      finding("outside", { file: "src/elsewhere.ts" }),
    ];
    expect(countedInDiff(list, files)).toBe(1);
    expect(countedInDiff([], files)).toBe(0);
  });
});

function prFile(path: string): PrFile {
  return { path, additions: 1, deletions: 0, patch: null };
}

function group(role: SmartDiffGroup["role"], paths: string[]): SmartDiffGroup {
  return {
    role,
    files: paths.map((path) => ({ path, additions: 1, deletions: 0, finding_lines: [] })),
  };
}

const paths = (list: PrFile[]) => list.map((f) => f.path);

describe("joinGroups", () => {
  it("keeps the groups in the order of the response, and the files inside a group in the response order", () => {
    const files = [prFile("a.ts"), prFile("b.ts"), prFile("c.test.ts")];
    const joined = joinGroups(
      [group("tests", ["c.test.ts"]), group("core", ["b.ts", "a.ts"])],
      files,
    );
    expect(joined.groups.map((g) => g.role)).toEqual(["tests", "core"]);
    expect(paths(joined.groups[1]?.files ?? [])).toEqual(["b.ts", "a.ts"]);
    expect(joined.ungrouped).toEqual([]);
  });

  it("skips a response path that has no PrFile", () => {
    const joined = joinGroups([group("core", ["a.ts", "gone.ts"])], [prFile("a.ts")]);
    expect(paths(joined.groups[0]?.files ?? [])).toEqual(["a.ts"]);
    expect(joined.ungrouped).toEqual([]);
  });

  it("puts a PrFile the response does not mention into ungrouped, in the order of the PR", () => {
    const files = [prFile("z.ts"), prFile("a.ts"), prFile("m.ts")];
    const joined = joinGroups([group("core", ["a.ts"])], files);
    expect(paths(joined.groups[0]?.files ?? [])).toEqual(["a.ts"]);
    expect(paths(joined.ungrouped)).toEqual(["z.ts", "m.ts"]);
  });

  it("puts every file into ungrouped when the response has no group", () => {
    const files = [prFile("a.ts"), prFile("b.ts")];
    expect(joinGroups([], files)).toEqual({ groups: [], ungrouped: files });
  });
});

describe("groupFindingMark", () => {
  const files = [prFile("src/a.ts"), prFile("src/b.ts"), prFile("src/c.ts")];

  it("counts files, not findings: five findings in two files give 2", () => {
    const list = [
      finding("1", { file: "src/a.ts" }),
      finding("2", { file: "src/a.ts" }),
      finding("3", { file: "src/a.ts" }),
      finding("4", { file: "src/b.ts" }),
      finding("5", { file: "src/b.ts" }),
    ];
    expect(groupFindingMark(files, list)?.files).toBe(2);
  });

  it("does not count a file whose only finding is dismissed", () => {
    const list = [
      finding("live", { file: "src/a.ts" }),
      finding("dismissed", { file: "src/b.ts", dismissed_at: "2026-10-04T00:00:00Z" }),
    ];
    expect(groupFindingMark(files, list)).toEqual({ files: 1, severity: "WARNING" });
  });

  it("takes the most severe counted finding, ignoring a more severe dismissed one", () => {
    const list = [
      finding("s", { file: "src/a.ts", severity: "SUGGESTION" }),
      finding("w", { file: "src/b.ts", severity: "WARNING" }),
      finding("c-dismissed", {
        file: "src/c.ts",
        severity: "CRITICAL",
        dismissed_at: "2026-10-04T00:00:00Z",
      }),
    ];
    expect(groupFindingMark(files, list)).toEqual({ files: 2, severity: "WARNING" });

    list.push(finding("c", { file: "src/c.ts", severity: "CRITICAL" }));
    expect(groupFindingMark(files, list)).toEqual({ files: 3, severity: "CRITICAL" });
  });

  it("gives null when no file of the group has a counted finding", () => {
    expect(groupFindingMark(files, [])).toBeNull();
    expect(
      groupFindingMark(files, [
        finding("dismissed", { file: "src/a.ts", dismissed_at: "2026-10-04T00:00:00Z" }),
        finding("elsewhere", { file: "src/other.ts" }),
      ]),
    ).toBeNull();
  });
});
