import { describe, it, expect } from "vitest";
import { compareByPath, formatRootList, kindColor } from "./context-display";

describe("formatRootList", () => {
  it("joins three roots with commas and the or-word", () => {
    expect(formatRootList(["specs", "docs", "insights"], "or")).toBe("specs/, docs/ or insights/");
  });

  it("joins two roots with the or-word only", () => {
    expect(formatRootList(["specs", "docs"], "or")).toBe("specs/ or docs/");
  });

  it("returns a single root as one folder", () => {
    expect(formatRootList(["adr"], "or")).toBe("adr/");
  });

  it("uses the word it is given", () => {
    expect(formatRootList(["a", "b"], "oder")).toBe("a/ oder b/");
  });
});

describe("kindColor", () => {
  it("gives each named kind its own colour", () => {
    expect(kindColor("specs")).toBe("var(--accent)");
    expect(kindColor("docs")).toBe("#10b981");
    expect(kindColor("insights")).toBe("#f59e0b");
  });

  it("gives any other root the neutral colour, including names that exist on Object.prototype", () => {
    expect(kindColor("adr")).toBe("var(--text-secondary)");
    expect(kindColor("constructor")).toBe("var(--text-secondary)");
  });
});

describe("compareByPath", () => {
  it("orders by code unit, so an upper-case path sorts before a lower-case one", () => {
    const paths = ["docs/b.md", "Docs/z.md", "docs/a.md"].map((path) => ({ path }));
    expect(paths.sort(compareByPath).map((p) => p.path)).toEqual(["Docs/z.md", "docs/a.md", "docs/b.md"]);
    expect(compareByPath({ path: "a" }, { path: "a" })).toBe(0);
  });
});
