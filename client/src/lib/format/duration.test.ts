import { describe, expect, it } from "vitest";
import { averageDurationMs, formatDuration, runDurationMs, slowestRuns } from "./duration";

const run = (startedAt: string, finishedAt: string) => ({ startedAt, finishedAt });

describe("formatDuration", () => {
  it("keeps milliseconds under one second", () => {
    expect(formatDuration(850)).toBe("850ms");
  });

  it("prints minutes and seconds", () => {
    expect(formatDuration(65_000)).toBe("1m 5s");
  });
});

describe("runDurationMs", () => {
  it("is the difference between the two timestamps", () => {
    expect(runDurationMs(run("2026-10-07T10:00:00Z", "2026-10-07T10:00:42Z"))).toBe(42_000);
  });
});

describe("averageDurationMs", () => {
  it("is the mean of the run lengths", () => {
    const runs = [
      run("2026-10-07T10:00:00Z", "2026-10-07T10:00:10Z"),
      run("2026-10-07T10:00:00Z", "2026-10-07T10:00:30Z"),
    ];
    expect(averageDurationMs(runs)).toBe(20_000);
  });
});

describe("slowestRuns", () => {
  it("puts the slowest run first", () => {
    const fast = run("2026-10-07T10:00:00Z", "2026-10-07T10:00:05Z");
    const slow = run("2026-10-07T10:00:00Z", "2026-10-07T10:01:00Z");
    expect(slowestRuns([fast, slow], 5)[0]).toBe(slow);
  });
});
