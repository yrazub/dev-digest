import { describe, it, expect } from "vitest";
import type { EvalSuiteRun } from "@devdigest/shared";
import {
  configDiffers,
  costDelta,
  deltaPoints,
  deltaText,
  flippedCases,
  formatRunTime,
  latestDone,
  orderPair,
  pct,
  previousDone,
  runCheckboxLabel,
  runningRun,
  sameConfig,
  sparkValues,
} from "./helpers";

describe("pct", () => {
  it("rounds a 0..1 metric to a whole percent and shows an em-dash when unknown", () => {
    expect(pct(0.5)).toBe("50%");
    expect(pct(0.666)).toBe("67%");
    expect(pct(0)).toBe("0%");
    expect(pct(1)).toBe("100%");
    expect(pct(null)).toBe("—");
    expect(pct(undefined)).toBe("—");
  });
});

describe("deltaPoints / deltaText", () => {
  it("subtracts the rounded percentages, not the raw values", () => {
    expect(deltaPoints(0.75, 0.5)).toBe(25);
    expect(deltaPoints(0.5, 0.75)).toBe(-25);
    // 0.504 -> 50 and 0.496 -> 50: the displayed values are equal, so the delta is 0
    expect(deltaPoints(0.504, 0.496)).toBe(0);
    expect(deltaPoints(0, 0)).toBe(0);
  });

  it("is null when either side is unknown", () => {
    expect(deltaPoints(null, 0.5)).toBeNull();
    expect(deltaPoints(0.5, null)).toBeNull();
    expect(deltaPoints(null, null)).toBeNull();
  });

  it("renders the sign, the arrow and the unit, with U+2212 for a drop and ±0 for none", () => {
    expect(deltaText(12)).toBe("▲ +12pt");
    expect(deltaText(-8)).toBe("▼ −8pt");
    expect(deltaText(-8)).toContain("−");
    expect(deltaText(0)).toBe("±0pt");
  });
});

describe("formatRunTime / runCheckboxLabel", () => {
  it("prints the local time as YYYY-MM-DD HH:mm, zero-padded", () => {
    // built from local components, so the expectation holds in any timezone
    const iso = new Date(2026, 9, 30, 10, 0).toISOString();
    expect(formatRunTime(iso)).toBe("2026-10-30 10:00");
    expect(formatRunTime(new Date(2026, 0, 5, 3, 7).toISOString())).toBe("2026-01-05 03:07");
  });

  it("names a run's checkbox `<time> · v<n>`", () => {
    const run = {
      started_at: new Date(2026, 9, 30, 10, 0).toISOString(),
      config: { agent_version: 4 },
    } as Pick<EvalSuiteRun, "started_at" | "config">;
    expect(runCheckboxLabel(run)).toBe("2026-10-30 10:00 · v4");
  });
});

describe("run picks", () => {
  const r = (id: string, status: EvalSuiteRun["status"]) => ({ id, status });

  it("latestDone and previousDone skip running and failed runs, newest first", () => {
    const runs = [r("a", "running"), r("b", "failed"), r("c", "done"), r("d", "failed"), r("e", "done")];
    expect(latestDone(runs)?.id).toBe("c");
    expect(previousDone(runs)?.id).toBe("e");
    expect(runningRun(runs)?.id).toBe("a");
  });

  it("return null when there is no such run", () => {
    expect(latestDone([r("a", "failed")])).toBeNull();
    expect(previousDone([r("a", "done")])).toBeNull();
    expect(runningRun([r("a", "done")])).toBeNull();
    expect(latestDone([])).toBeNull();
  });
});

describe("sparkValues", () => {
  it("drops null and undefined points and keeps the order", () => {
    expect(sparkValues([0.5, null, 1, undefined, 0.25])).toEqual([0.5, 1, 0.25]);
  });

  it("keeps a zero value", () => {
    expect(sparkValues([0, null, 0.5])).toEqual([0, 0.5]);
  });

  it("doubles a single point so the sparkline draws a flat line", () => {
    expect(sparkValues([0.75])).toEqual([0.75, 0.75]);
    expect(sparkValues([null, 0.4, undefined])).toEqual([0.4, 0.4]);
  });

  it("returns an empty list when there is no point", () => {
    expect(sparkValues([])).toEqual([]);
    expect(sparkValues([null, undefined])).toEqual([]);
  });
});

describe("costDelta", () => {
  it("signs the change with U+2212 for a drop and + for a rise", () => {
    expect(costDelta(0.004, 0.003)).toBe("−$0.0010");
    expect(costDelta(0.003, 0.004)).toBe("+$0.0010");
  });

  it("reads no change, including sub-cent noise, as ±$0.0000", () => {
    expect(costDelta(0.004, 0.004)).toBe("±$0.0000");
    expect(costDelta(0.004, 0.00400001)).toBe("±$0.0000");
  });

  it("is null when either cost is unknown", () => {
    expect(costDelta(null, 0.003)).toBeNull();
    expect(costDelta(0.004, null)).toBeNull();
    expect(costDelta(undefined, undefined)).toBeNull();
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

describe("sameConfig / configDiffers", () => {
  const base = {
    system_prompt: "p",
    model: "gpt-x",
    skills: [
      { name: "sql", version: 1 },
      { name: "xss", version: 2 },
    ],
  };
  const withSkills = (skills: { name: string; version: number }[]) => ({ ...base, skills });

  it("equal snapshots are the same config and do not differ", () => {
    expect(sameConfig(base, { ...base })).toBe(true);
    expect(configDiffers(base, { ...base })).toBe(false);
  });

  it("a different prompt alone is not a config difference but is not the same config", () => {
    const other = { ...base, system_prompt: "q" };
    expect(sameConfig(base, other)).toBe(false);
    expect(configDiffers(base, other)).toBe(false);
  });

  it("a different model differs", () => {
    const other = { ...base, model: "gpt-y" };
    expect(configDiffers(base, other)).toBe(true);
    expect(sameConfig(base, other)).toBe(false);
  });

  it("a different skill set or skill version differs; the order of skills does not matter", () => {
    expect(configDiffers(base, withSkills([{ name: "sql", version: 1 }]))).toBe(true);
    expect(
      configDiffers(
        base,
        withSkills([
          { name: "sql", version: 1 },
          { name: "xss", version: 3 },
        ]),
      ),
    ).toBe(true);
    const reversed = withSkills([...base.skills].reverse());
    expect(configDiffers(base, reversed)).toBe(false);
    expect(sameConfig(base, reversed)).toBe(true);
  });
});

describe("flippedCases", () => {
  const detail = (rows: [string, "pass" | "fail" | "errored"][]) => ({
    results: rows.map(([case_name, outcome]) => ({ case_name, outcome })),
  });

  it("lists the cases present in both runs whose outcome differs, in the new run's order", () => {
    const before = detail([
      ["a", "fail"],
      ["b", "pass"],
      ["c", "errored"],
    ]);
    const after = detail([
      ["c", "pass"],
      ["b", "pass"],
      ["a", "pass"],
    ]);
    expect(flippedCases(before, after)).toEqual([
      { name: "c", old: "errored", new: "pass" },
      { name: "a", old: "fail", new: "pass" },
    ]);
  });

  it("ignores a case that exists in only one run, and is empty when nothing changed", () => {
    const before = detail([["only-old", "fail"], ["same", "pass"]]);
    const after = detail([["only-new", "pass"], ["same", "pass"]]);
    expect(flippedCases(before, after)).toEqual([]);
  });
});
