import { describe, it, expect } from "vitest";
import { toSkillTab } from "./constants";

describe("toSkillTab", () => {
  it("keeps context", () => {
    expect(toSkillTab("context")).toBe("context");
  });

  it.each(["config", "preview", "versions"])("keeps %s", (tab) => {
    expect(toSkillTab(tab)).toBe(tab);
  });

  it.each([["nope"], [""], [null]])("falls back to config for %j", (value) => {
    expect(toSkillTab(value)).toBe("config");
  });
});
