import { describe, it, expect } from "vitest";
import { wordDiff, type DiffToken } from "./word-diff";

/** Joining same + add rebuilds the new text; same + del rebuilds the old text. */
const rebuild = (tokens: DiffToken[], drop: "add" | "del") =>
  tokens
    .filter((t) => t.type !== drop)
    .map((t) => t.text)
    .join("");

describe("wordDiff", () => {
  it("marks identical prompts as one same token", () => {
    expect(wordDiff("Check for SQL injection.", "Check for SQL injection.")).toEqual([
      { type: "same", text: "Check for SQL injection." },
    ]);
  });

  it("marks an inserted word as add, and merges neighbours of one type", () => {
    const tokens = wordDiff("Check for injection", "Check for SQL injection");
    expect(tokens.some((t) => t.type === "add" && t.text.includes("SQL"))).toBe(true);
    expect(tokens.some((t) => t.type === "del")).toBe(false);
    expect(rebuild(tokens, "del")).toBe("Check for SQL injection");
    expect(rebuild(tokens, "add")).toBe("Check for injection");
    for (let i = 1; i < tokens.length; i++) expect(tokens[i]!.type).not.toBe(tokens[i - 1]!.type);
  });

  it("marks a removed sentence as del", () => {
    const oldText = "Be strict. Ignore style nits.";
    const newText = "Be strict.";
    const tokens = wordDiff(oldText, newText);
    const del = tokens.filter((t) => t.type === "del").map((t) => t.text.trim());
    expect(del).toEqual(["Ignore style nits."]);
    expect(tokens.some((t) => t.type === "add")).toBe(false);
    expect(rebuild(tokens, "add")).toBe(oldText);
    expect(rebuild(tokens, "del")).toBe(newText);
  });

  it("shows a replaced word as del plus add", () => {
    const tokens = wordDiff("flag warnings", "flag errors");
    expect(tokens.filter((t) => t.type === "del").map((t) => t.text)).toEqual(["warnings"]);
    expect(tokens.filter((t) => t.type === "add").map((t) => t.text)).toEqual(["errors"]);
  });

  it("keeps whitespace and newlines exactly", () => {
    const oldText = "Rules:\n\n  1. one\n  2. two\n";
    const newText = "Rules:\n\n  1. one\n  2. three\n";
    const tokens = wordDiff(oldText, newText);
    expect(rebuild(tokens, "del")).toBe(newText);
    expect(rebuild(tokens, "add")).toBe(oldText);
    expect(tokens.map((t) => t.text).join("")).toContain("\n\n  ");
  });

  it("handles an empty side", () => {
    expect(wordDiff("", "new text")).toEqual([{ type: "add", text: "new text" }]);
    expect(wordDiff("old text", "")).toEqual([{ type: "del", text: "old text" }]);
    expect(wordDiff("", "")).toEqual([]);
  });
});
