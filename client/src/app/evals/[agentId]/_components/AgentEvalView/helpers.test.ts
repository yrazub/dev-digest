import { describe, it, expect } from "vitest";
import type { EvalSuiteRun } from "@devdigest/shared";
import { comparablePair, metricSpark, orderPair, parseCompareParam, precisionDip, toggleSelection, trendPoints, trendTooltipLabel } from "./helpers";

function run(id: string, version: number, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    status: "done",
    config: { agent_version: version, system_prompt: "p", provider: "openai", model: "gpt-x", strategy: "single-pass", skills: [] },
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    cases_total: 2,
    cases_done: 2,
    cases_passed: 2,
    cases_errored: 0,
    cost_usd: 0.004,
    started_at: new Date(2026, 9, 30, 10, 0).toISOString(),
    finished_at: null,
    error: null,
    ...over,
  } as EvalSuiteRun;
}

describe("toggleSelection", () => {
  it("adds a run, and removes it when it is picked again", () => {
    expect(toggleSelection([], "a")).toEqual(["a"]);
    expect(toggleSelection(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b"], "a")).toEqual(["b"]);
  });

  it("a third pick drops the earliest-selected run", () => {
    expect(toggleSelection(["a", "b"], "c")).toEqual(["b", "c"]);
  });

  it("does not mutate its input", () => {
    const sel = ["a", "b"] as const;
    toggleSelection(sel, "c");
    expect(sel).toEqual(["a", "b"]);
  });
});

describe("precisionDip", () => {
  it("returns the drop in shown points and the latest done run's version", () => {
    const runs = [run("r2", 2, { precision: 0.5 }), run("r1", 1, { precision: 1 })];
    expect(precisionDip(runs)).toEqual({ n: 50, version: 2 });
  });

  it("skips running and failed runs when picking latest and previous", () => {
    const runs = [
      run("r4", 4, { status: "running", precision: null }),
      run("r3", 3, { precision: 0.8 }),
      run("r2", 2, { status: "failed", precision: null }),
      run("r1", 1, { precision: 0.9 }),
    ];
    expect(precisionDip(runs)).toEqual({ n: 10, version: 3 });
  });

  it("is null when precision is equal, rose, unknown, or there is one done run", () => {
    expect(precisionDip([run("r2", 2, { precision: 0.5 }), run("r1", 1, { precision: 0.5 })])).toBeNull();
    expect(precisionDip([run("r2", 2, { precision: 0.9 }), run("r1", 1, { precision: 0.5 })])).toBeNull();
    expect(precisionDip([run("r2", 2, { precision: null }), run("r1", 1, { precision: 0.5 })])).toBeNull();
    expect(precisionDip([run("r1", 1)])).toBeNull();
    expect(precisionDip([])).toBeNull();
  });

  it("compares shown percentages, so a sub-point change is no dip", () => {
    expect(precisionDip([run("r2", 2, { precision: 0.496 }), run("r1", 1, { precision: 0.504 })])).toBeNull();
  });
});

describe("trendPoints", () => {
  it("lists the done runs oldest first and keeps null metrics as gaps", () => {
    const runs = [
      run("r3", 3, { recall: null, precision: null, citation_accuracy: null, cost_usd: null }),
      run("r2", 2, { status: "failed", recall: null }),
      run("r1", 1, { recall: 0.5, precision: 0.25, citation_accuracy: 0, cost_usd: 0.003 }),
    ];
    expect(trendPoints(runs)).toEqual([
      { id: "r1", version: 1, recall: 0.5, precision: 0.25, citation: 0, cost: 0.003 },
      { id: "r3", version: 3, recall: null, precision: null, citation: null, cost: null },
    ]);
  });

  it("does not reorder the caller's array", () => {
    const runs = [run("r2", 2), run("r1", 1)];
    trendPoints(runs);
    expect(runs.map((r) => r.id)).toEqual(["r2", "r1"]);
  });
});

describe("trendTooltipLabel", () => {
  it("shows the version and the cost, or an em-dash for an unknown cost", () => {
    expect(trendTooltipLabel({ version: 3, cost: 0.004 })).toBe("v3 · $0.0040");
    expect(trendTooltipLabel({ version: 3, cost: null })).toBe("v3 · —");
  });
});

describe("metricSpark", () => {
  it("returns done runs oldest first and drops nulls", () => {
    const runs = [run("r3", 3, { recall: 0.9 }), run("r2", 2, { recall: null }), run("r1", 1, { recall: 0.5 })];
    expect(metricSpark(runs, "recall")).toEqual([0.5, 0.9]);
  });

  it("repeats a single point once, and is empty with no value", () => {
    expect(metricSpark([run("r1", 1, { precision: 0.4 })], "precision")).toEqual([0.4, 0.4]);
    expect(metricSpark([run("r1", 1, { precision: null })], "precision")).toEqual([]);
  });
});

describe("parseCompareParam", () => {
  it("returns the two ids of `a,b`", () => {
    expect(parseCompareParam("run-a,run-b")).toEqual(["run-a", "run-b"]);
  });

  it("is null for a missing, empty, single or over-long value", () => {
    expect(parseCompareParam(null)).toBeNull();
    expect(parseCompareParam(undefined)).toBeNull();
    expect(parseCompareParam("")).toBeNull();
    expect(parseCompareParam("a")).toBeNull();
    expect(parseCompareParam("a,b,c")).toBeNull();
  });

  it("is null when either id is empty", () => {
    expect(parseCompareParam(",b")).toBeNull();
    expect(parseCompareParam("a,")).toBeNull();
    expect(parseCompareParam(",")).toBeNull();
  });
});

describe("comparablePair", () => {
  const older = run("r1", 1, { started_at: new Date(2026, 9, 29, 10).toISOString() });
  const newer = run("r2", 2, { started_at: new Date(2026, 9, 30, 10).toISOString() });

  it("returns [older, newer] ids for two distinct done runs of the agent, in either order", () => {
    expect(comparablePair("ag1", newer, older)).toEqual(["r1", "r2"]);
    expect(comparablePair("ag1", older, newer)).toEqual(["r1", "r2"]);
  });

  it("is null while a run is not loaded, is not done, is another agent's, or both ids are the same run", () => {
    expect(comparablePair("ag1", undefined, newer)).toBeNull();
    expect(comparablePair("ag1", older, undefined)).toBeNull();
    expect(comparablePair("ag1", older, run("r2", 2, { status: "failed" }))).toBeNull();
    expect(comparablePair("ag1", older, run("r2", 2, { status: "running" }))).toBeNull();
    expect(comparablePair("ag1", older, run("r2", 2, { agent_id: "other" }))).toBeNull();
    expect(comparablePair("ag1", older, older)).toBeNull();
  });
});

describe("orderPair", () => {
  const older = { id: "o", started_at: new Date(2026, 9, 29, 10).toISOString() };
  const newer = { id: "n", started_at: new Date(2026, 9, 30, 10).toISOString() };

  it("returns [older, newer] whichever way the runs are given", () => {
    expect(orderPair(newer, older)).toEqual([older, newer]);
    expect(orderPair(older, newer)).toEqual([older, newer]);
  });

  it("keeps the given order on a tie", () => {
    const twin = { id: "t", started_at: older.started_at };
    expect(orderPair(older, twin)).toEqual([older, twin]);
  });
});
