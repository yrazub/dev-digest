import { describe, it, expect } from "vitest";
import { formatRunTime } from "@/components/eval";
import { lastRunParams, sparklinePoints } from "./helpers";

describe("sparklinePoints", () => {
  it("drops null points and keeps the order of the rest", () => {
    expect(sparklinePoints([0.5, null, 1, null, 0.25])).toEqual([0.5, 1, 0.25]);
  });

  it("repeats a single point once so the line is flat", () => {
    expect(sparklinePoints([0.75])).toEqual([0.75, 0.75]);
    expect(sparklinePoints([null, 0.4, null])).toEqual([0.4, 0.4]);
  });

  it("keeps a zero point (0 is a value, not a missing one)", () => {
    expect(sparklinePoints([0, 0.5])).toEqual([0, 0.5]);
  });

  it("returns no points for an empty or all-null trend", () => {
    expect(sparklinePoints([])).toEqual([]);
    expect(sparklinePoints([null, null])).toEqual([]);
  });
});

describe("lastRunParams", () => {
  it("maps the latest run to the values of the last-run line", () => {
    const started_at = new Date(2026, 9, 30, 10, 5).toISOString();
    expect(
      lastRunParams({
        started_at,
        config: { agent_version: 4, system_prompt: "p", provider: "openai", model: "m", strategy: "single-pass", skills: [] },
        cases_passed: 3,
        cases_total: 5,
      }),
    ).toEqual({ version: 4, time: formatRunTime(started_at), passed: 3, total: 5 });
    expect(formatRunTime(started_at)).toBe("2026-10-30 10:05");
  });
});
