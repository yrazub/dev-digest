import { describe, it, expect } from "vitest";
import { AGENT_TABS, toAgentTab } from "./constants";

describe("toAgentTab", () => {
  it("keeps evals instead of coercing it to config", () => {
    expect(toAgentTab("evals")).toBe("evals");
  });

  it("lists the tabs in order, Evals last", () => {
    expect(AGENT_TABS).toEqual(["config", "skills", "context", "evals"]);
  });

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
