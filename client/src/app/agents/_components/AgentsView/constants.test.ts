import { describe, it, expect } from "vitest";
import { toAgentTab } from "./constants";

describe("toAgentTab", () => {
  it("keeps context (R-WEB-36)", () => {
    expect(toAgentTab("context")).toBe("context");
  });

  it.each(["config", "skills"])("keeps %s", (tab) => {
    expect(toAgentTab(tab)).toBe(tab);
  });

  it.each([["nope"], [""], [null]])("falls back to config for %j", (value) => {
    expect(toAgentTab(value)).toBe("config");
  });
});
