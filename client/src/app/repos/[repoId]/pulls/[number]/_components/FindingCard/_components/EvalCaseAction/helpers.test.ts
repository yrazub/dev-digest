import { describe, it, expect } from "vitest";
import { evalActionState, kindOf } from "./helpers";

const BASE = { accepted: true, dismissed: false, agentId: "a1", inSet: false, pending: false, saved: false };

describe("evalActionState", () => {
  it("is ready for a decided finding with an agent", () => {
    expect(evalActionState(BASE)).toBe("ready");
    expect(evalActionState({ ...BASE, accepted: false, dismissed: true })).toBe("ready");
  });

  it("is open when there is no decision, pending while the request runs", () => {
    expect(evalActionState({ ...BASE, accepted: false })).toBe("open");
    expect(evalActionState({ ...BASE, pending: true })).toBe("pending");
  });

  it("follows the order: saved, in set, no agent, open, pending, ready", () => {
    const all = { accepted: false, dismissed: false, agentId: null, inSet: true, pending: true, saved: true };
    expect(evalActionState(all)).toBe("saved");
    expect(evalActionState({ ...all, saved: false })).toBe("inSet");
    expect(evalActionState({ ...all, saved: false, inSet: false })).toBe("noAgent");
    expect(evalActionState({ ...all, saved: false, inSet: false, agentId: "a1" })).toBe("open");
    expect(evalActionState({ ...all, saved: false, inSet: false, agentId: "a1", accepted: true })).toBe("pending");
  });
});

describe("kindOf", () => {
  it("is must_find for an accepted finding and must_not_flag for a dismissed one", () => {
    expect(kindOf({ accepted_at: "2026-10-04T00:00:00Z", dismissed_at: null })).toBe("must_find");
    expect(kindOf({ accepted_at: null, dismissed_at: "2026-10-04T00:00:00Z" })).toBe("must_not_flag");
  });
});
