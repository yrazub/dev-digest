import { describe, it, expect } from "vitest";
import type { ProjectContextList, SpecFile } from "@devdigest/shared";
import { filterDocuments, viewMode } from "./helpers";

function doc(path: string): SpecFile {
  return { path, kind: "specs", tokens: 1, status: "ok" };
}

function list(over: Partial<ProjectContextList> = {}): ProjectContextList {
  return {
    state: "ready",
    roots: ["specs"],
    documents: [doc("specs/a.md")],
    total_tokens: 1,
    capped: false,
    cap: 1000,
    soft_cap_tokens: 8000,
    run_cap_tokens: 16000,
    ...over,
  };
}

describe("viewMode", () => {
  it("returns one mode per state", () => {
    expect(viewMode({ data: undefined, isLoading: true, isError: false })).toBe("loading");
    expect(viewMode({ data: undefined, isLoading: false, isError: false })).toBe("loading");
    expect(viewMode({ data: undefined, isLoading: false, isError: true })).toBe("error");
    expect(viewMode({ data: list({ state: "not_cloned", documents: [] }), isLoading: false, isError: false })).toBe(
      "not_cloned",
    );
    expect(viewMode({ data: list({ documents: [] }), isLoading: false, isError: false })).toBe("empty");
    expect(viewMode({ data: list(), isLoading: false, isError: false })).toBe("list");
  });

  it("a failed refetch that kept its data is an error, not a list", () => {
    expect(viewMode({ data: list(), isLoading: false, isError: true })).toBe("error");
  });
});

describe("filterDocuments", () => {
  const docs = [doc("specs/B.md"), doc("docs/guide.md"), doc("specs/a.md")];

  it("matches a path substring regardless of case and returns the documents sorted by path", () => {
    expect(filterDocuments(docs, "SPECS").map((d) => d.path)).toEqual(["specs/B.md", "specs/a.md"]);
    expect(filterDocuments(docs, "").map((d) => d.path)).toEqual(["docs/guide.md", "specs/B.md", "specs/a.md"]);
    expect(filterDocuments(docs, "nothing")).toEqual([]);
  });

  it("does not reorder the array it was given", () => {
    const before = docs.map((d) => d.path);
    filterDocuments(docs, "");
    expect(docs.map((d) => d.path)).toEqual(before);
  });
});
