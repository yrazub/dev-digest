import { describe, it, expect } from "vitest";
import { resyncSettled } from "./repo-intel-resync";

const FROM = "2026-09-21T20:28:46.312Z";

describe("resyncSettled", () => {
  it("is false when no wait is running, even if a state is there", () => {
    expect(resyncSettled(null, { updatedAt: FROM })).toBe(false);
  });

  it("is false while the state is not loaded", () => {
    expect(resyncSettled(FROM, null)).toBe(false);
    expect(resyncSettled(FROM, undefined)).toBe(false);
  });

  it("is false while the index row still has the updatedAt captured at the press", () => {
    expect(resyncSettled(FROM, { updatedAt: FROM })).toBe(false);
  });

  it("is true once the index row has another updatedAt", () => {
    expect(resyncSettled(FROM, { updatedAt: "2026-09-21T20:31:02.100Z" })).toBe(true);
  });
});
