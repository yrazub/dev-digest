import { describe, it, expect } from "vitest";
import type { ProjectContextList, SpecFile } from "@devdigest/shared";
import {
  attachMode,
  attachedTotal,
  filterRows,
  movePath,
  orderRows,
  runCapSkips,
  togglePath,
  type AttachRow,
} from "./helpers";

function doc(path: string, tokens: number | null = 100, status: SpecFile["status"] = "ok"): SpecFile {
  return { path, kind: path.split("/")[0] ?? "docs", tokens, status };
}

function rowsOf(docs: SpecFile[], paths: string[]): AttachRow[] {
  return orderRows(docs, paths);
}

describe("orderRows", () => {
  it("puts attached paths first in stored order, then the others by path", () => {
    const docs = [doc("specs/c.md"), doc("docs/a.md"), doc("insights/z.md"), doc("specs/b.md")];
    const rows = orderRows(docs, ["specs/c.md", "docs/a.md"]);
    expect(rows.map((r) => `${r.path}:${r.attached}`)).toEqual([
      "specs/c.md:true",
      "docs/a.md:true",
      "insights/z.md:false",
      "specs/b.md:false",
    ]);
  });

  it("sorts the unattached rows in code-unit order and keeps a not-found attached path in its position", () => {
    const docs = [doc("docs/b.md"), doc("docs/B.md"), doc("docs/a.md")];
    const rows = orderRows(docs, ["docs/a.md", "gone/x.md"]);
    expect(rows.map((r) => r.path)).toEqual(["docs/a.md", "gone/x.md", "docs/B.md", "docs/b.md"]);
    expect(rows[1]).toEqual({ path: "gone/x.md", doc: null, attached: true });
    expect(rows[0]?.doc?.path).toBe("docs/a.md");
    expect(rows[2]?.attached).toBe(false);
  });
});

describe("filterRows", () => {
  it("matches the path as a case-insensitive substring and keeps the order", () => {
    const rows = rowsOf([doc("docs/Guide.md"), doc("specs/guide-2.md"), doc("insights/log.md")], ["specs/guide-2.md"]);
    expect(filterRows(rows, "GUIDE").map((r) => r.path)).toEqual(["specs/guide-2.md", "docs/Guide.md"]);
    expect(filterRows(rows, "  ")).toHaveLength(3);
    expect(filterRows(rows, "nope")).toEqual([]);
  });
});

describe("attachedTotal", () => {
  it("sums attached tokens only; a not-found or null-token row counts 0", () => {
    const docs = [doc("a.md", 10), doc("b.md", 20), doc("c.md", null, "unreadable"), doc("d.md", 1000)];
    const rows = rowsOf(docs, ["a.md", "c.md", "missing.md", "b.md"]);
    expect(attachedTotal(rows)).toBe(30);
    expect(attachedTotal(rowsOf(docs, []))).toBe(0);
  });
});

describe("runCapSkips", () => {
  const docs = [doc("a.md", 6000), doc("b.md", 6000), doc("c.md", 6000), doc("d.md", 500), doc("e.md", 9000)];

  it("names the attached rows from the first one that crosses the cap to the last", () => {
    const rows = rowsOf(docs, ["a.md", "b.md", "c.md", "d.md"]);
    // 6000, 12000, 18000 > 16000 -> c is the first skipped, d follows
    expect(runCapSkips(rows, 16000)).toEqual(["c.md", "d.md"]);
  });

  it("names nothing when the sum stays within the cap, and a row equal to the cap fits", () => {
    expect(runCapSkips(rowsOf(docs, ["a.md", "b.md"]), 12000)).toEqual([]);
    expect(runCapSkips(rowsOf(docs, ["a.md", "b.md"]), 11999)).toEqual(["b.md"]);
  });

  it("ignores unattached rows, not-found rows and null-token rows", () => {
    const withBad = [...docs, doc("u.md", null, "too_large")];
    const rows = rowsOf(withBad, ["a.md", "u.md", "gone.md", "b.md", "c.md"]);
    expect(runCapSkips(rows, 16000)).toEqual(["c.md"]);
  });
});

describe("togglePath", () => {
  it("appends a checked path to the end and removes an unchecked one", () => {
    expect(togglePath(["a", "b"], "c", true)).toEqual(["a", "b", "c"]);
    expect(togglePath(["a", "b", "c"], "b", false)).toEqual(["a", "c"]);
  });

  it("does not duplicate a path that is already attached and leaves the input untouched", () => {
    const input = ["a", "b"];
    expect(togglePath(input, "a", true)).toEqual(["a", "b"]);
    expect(togglePath(input, "x", false)).toEqual(["a", "b"]);
    expect(input).toEqual(["a", "b"]);
  });
});

describe("movePath", () => {
  it("moves a path to the position of the target, down and up", () => {
    expect(movePath(["a", "b", "c", "d"], "a", "c")).toEqual(["b", "c", "a", "d"]);
    expect(movePath(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("returns an unchanged copy for an unknown path or the same path", () => {
    const input = ["a", "b", "c"];
    expect(movePath(input, "a", "x")).toEqual(["a", "b", "c"]);
    expect(movePath(input, "x", "a")).toEqual(["a", "b", "c"]);
    expect(movePath(input, "b", "b")).toEqual(["a", "b", "c"]);
    expect(input).toEqual(["a", "b", "c"]);
  });
});

describe("attachMode", () => {
  const ready: ProjectContextList = {
    state: "ready",
    roots: ["specs"],
    documents: [],
    total_tokens: 0,
    capped: false,
    cap: 1000,
    soft_cap_tokens: 4000,
    run_cap_tokens: 16000,
  };
  const base = {
    hasRepo: true,
    paths: [] as string[] | undefined,
    pathsLoading: false,
    pathsError: false,
    files: { data: ready as ProjectContextList | undefined, isLoading: false, isError: false },
  };

  it("returns one mode per situation", () => {
    expect(attachMode({ ...base, hasRepo: false })).toBe("no_repo");
    expect(attachMode({ ...base, pathsLoading: true })).toBe("loading");
    expect(attachMode({ ...base, files: { data: undefined, isLoading: true, isError: false } })).toBe("loading");
    expect(attachMode({ ...base, paths: undefined })).toBe("loading");
    expect(attachMode({ ...base, files: { ...base.files, data: { ...ready, state: "not_cloned" } } })).toBe("not_cloned");
    expect(attachMode(base)).toBe("list");
  });

  it("an error wins over kept data (a failed refetch keeps `data`)", () => {
    expect(attachMode({ ...base, files: { ...base.files, isError: true } })).toBe("error");
    expect(attachMode({ ...base, pathsError: true })).toBe("error");
  });
});
