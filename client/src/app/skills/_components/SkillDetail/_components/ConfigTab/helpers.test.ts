import { describe, it, expect } from "vitest";
import type { Skill } from "@devdigest/shared";
import { buildPatch } from "./helpers";

const SKILL = {
  name: "edge-cases",
  description: "d",
  type: "custom",
  enabled: true,
  body: "b",
} as Skill;

describe("buildPatch", () => {
  it("sends only changed fields", () => {
    expect(buildPatch(SKILL, { ...SKILL, enabled: false }, "")).toEqual({ enabled: false });
    expect(buildPatch(SKILL, { ...SKILL }, "note")).toEqual({});
  });

  it("attaches the change note only to a body change", () => {
    expect(buildPatch(SKILL, { ...SKILL, body: "b2" }, " tighter ")).toEqual({ body: "b2", version_note: "tighter" });
    expect(buildPatch(SKILL, { ...SKILL, body: "b2" }, "  ")).toEqual({ body: "b2" });
  });
});
