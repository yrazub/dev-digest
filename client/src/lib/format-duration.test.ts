import { describe, it, expect } from "vitest";
import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  it("keeps sub-second durations in milliseconds", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(850)).toBe("850ms");
    expect(formatDuration(999.4)).toBe("999ms");
  });

  it("switches to seconds with one decimal from one second up", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(2400)).toBe("2.4s");
    expect(formatDuration(59_940)).toBe("59.9s");
  });

  it("switches to minutes and zero-padded seconds from one minute up", () => {
    expect(formatDuration(60_000)).toBe("1m 00s");
    expect(formatDuration(65_000)).toBe("1m 05s");
    expect(formatDuration(119_600)).toBe("2m 00s");
  });

  it("renders an unknown or invalid duration as an em-dash, never as 0ms", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
    expect(formatDuration(-5)).toBe("—");
  });
});
