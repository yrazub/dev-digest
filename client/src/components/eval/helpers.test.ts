import { describe, it, expect } from "vitest";
import type { EvalSuiteRun } from "@devdigest/shared";
import {
  deltaPoints,
  deltaText,
  formatLocation,
  formatRunTime,
  latestDone,
  pct,
  previousDone,
  runCheckboxLabel,
  runningRun,
  shortenPath,
  sparkValues,
} from "./helpers";

describe("formatLocation", () => {
  it("joins the file and the line range as `file:start-end`", () => {
    expect(formatLocation("src/auth.ts", 10, 14)).toBe("src/auth.ts:10-14");
    expect(formatLocation("a.ts", 3, 3)).toBe("a.ts:3-3");
  });
});

describe("shortenPath", () => {
  it("returns a path that fits unchanged, including one of exactly 30 characters", () => {
    expect(shortenPath("src/format/duration.ts")).toBe("src/format/duration.ts");
    const thirty = "src/lib/format/duration-xyz.ts";
    expect(thirty).toHaveLength(30);
    expect(shortenPath(thirty)).toBe(thirty);
    // one character over the limit is cut
    expect(shortenPath("src/lib/format/duration-xyzw.ts")).toBe("…/lib/format/duration-xyzw.ts");
  });

  it("returns a path without a folder unchanged, however long", () => {
    const name = "a-very-long-file-name-without-any-folder.ts";
    expect(name.length).toBeGreaterThan(30);
    expect(shortenPath(name)).toBe(name);
  });

  it("cuts a long folder chain from the left and keeps the file name and as many trailing folders as fit", () => {
    expect(shortenPath("packages/billing/src/lib/format/duration.ts")).toBe("…/src/lib/format/duration.ts");
    // a bigger budget keeps more folders, a smaller one fewer
    expect(shortenPath("packages/billing/src/lib/format/duration.ts", 40)).toBe("…/billing/src/lib/format/duration.ts");
    expect(shortenPath("packages/billing/src/lib/format/duration.ts", 20)).toBe("…/format/duration.ts");
  });

  it("never cuts the file name, even when it alone exceeds the limit", () => {
    const name = "an-extremely-long-file-name-that-exceeds-the-limit.ts";
    expect(shortenPath(`src/some/dir/${name}`)).toBe(`…/${name}`);
  });
});

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
