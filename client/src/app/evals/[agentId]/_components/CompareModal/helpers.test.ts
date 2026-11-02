import { describe, it, expect } from "vitest";
import { configDiffers, costDelta, flippedCases, sameConfig } from "./helpers";

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
