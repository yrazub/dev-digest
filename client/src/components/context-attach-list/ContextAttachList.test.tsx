import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextFile, ProjectContextList, SpecFile } from "@devdigest/shared";
import messages from "../../../messages/en/context.json";

// One stable object per hook result: the component reads function identities (`refetch`).
const refetch = vi.fn();
const filesState: {
  data: ProjectContextList | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: typeof refetch;
} = { data: undefined, isLoading: false, isError: false, refetch };
const fileState: {
  data: ProjectContextFile | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: typeof refetch;
} = { data: undefined, isLoading: false, isError: false, refetch };
const repoState: { repoId: string | null } = { repoId: "r1" };
const fileCalls: Array<[string | null | undefined, string | null | undefined]> = [];

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: repoState.repoId,
    activeRepo: repoState.repoId ? { id: repoState.repoId, name: "x", full_name: "acme/x" } : null,
  }),
}));
vi.mock("@/lib/hooks/context", () => ({
  useContextFiles: () => filesState,
  useContextFile: (repoId: string | null | undefined, path: string | null | undefined) => {
    fileCalls.push([repoId, path]);
    return fileState;
  },
}));

import { ContextAttachList } from "./ContextAttachList";

const onSave = vi.fn();
const onRetryPaths = vi.fn();

function doc(path: string, tokens: number | null = 100, status: SpecFile["status"] = "ok"): SpecFile {
  return { path, kind: path.split("/")[0] ?? "docs", tokens, status };
}

function list(documents: SpecFile[], over: Partial<ProjectContextList> = {}): ProjectContextList {
  return {
    state: "ready",
    roots: ["specs", "docs", "insights"],
    documents,
    total_tokens: documents.reduce((n, d) => n + (d.tokens ?? 0), 0),
    capped: false,
    cap: 1000,
    soft_cap_tokens: 4000,
    run_cap_tokens: 16000,
    ...over,
  };
}

function file(over: Partial<ProjectContextFile> = {}): ProjectContextFile {
  return {
    path: "specs/b.md",
    kind: "specs",
    tokens: 100,
    status: "ok",
    content: "# Beta heading\n\nBody <b>raw</b> text.",
    used_by: { agents_direct: 1, agents_via_skill: 1, skills: 2 },
    ...over,
  };
}

function renderList(props: { heading?: string; paths?: string[] | undefined; pathsLoading?: boolean; pathsError?: boolean } = {}) {
  const paths = "paths" in props ? props.paths : [];
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextAttachList
        heading={props.heading ?? "Project context"}
        paths={paths}
        pathsLoading={props.pathsLoading ?? false}
        pathsError={props.pathsError ?? false}
        onRetryPaths={onRetryPaths}
        onSave={onSave}
      />
    </NextIntlClientProvider>,
  );
}

/** Document paths in the order the checkboxes appear on screen. */
function order(): string[] {
  return screen.getAllByRole("checkbox").map((c) => (c.getAttribute("aria-label") ?? "").replace(/^Attach /, ""));
}

function rowOf(path: string): HTMLElement {
  const li = screen.getByRole("checkbox", { name: `Attach ${path}` }).closest("li");
  if (!li) throw new Error(`no row for ${path}`);
  return li;
}

beforeEach(() => {
  refetch.mockClear();
  onSave.mockClear();
  onRetryPaths.mockClear();
  fileCalls.length = 0;
  repoState.repoId = "r1";
  Object.assign(filesState, {
    data: list([doc("specs/c.md", 300), doc("docs/a.md", 100), doc("specs/b.md", 200), doc("insights/z.md", 50)]),
    isLoading: false,
    isError: false,
  });
  Object.assign(fileState, { data: undefined, isLoading: false, isError: false });
});
afterEach(cleanup);

describe("ContextAttachList rows", () => {
  it.each(["Project context", "Project context to use"])(
    "under the heading %s: attached rows first in stored order, then the rest by path",
    (heading) => {
      renderList({ heading, paths: ["specs/c.md", "insights/z.md"] });

      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
      expect(order()).toEqual(["specs/c.md", "insights/z.md", "docs/a.md", "specs/b.md"]);
      expect(screen.getByRole("checkbox", { name: "Attach specs/c.md" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Attach insights/z.md" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Attach docs/a.md" })).not.toBeChecked();

      // each row: path, kind badge, Preview
      const row = within(rowOf("docs/a.md"));
      expect(row.getByText("docs/a.md")).toBeInTheDocument();
      expect(row.getByText("docs")).toBeInTheDocument();
      expect(row.getByRole("button", { name: "Preview" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Preview" })).toHaveLength(4);

      // a drag handle on attached rows only
      expect(screen.getByRole("button", { name: "Drag specs/c.md to reorder" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Drag docs/a.md to reorder" })).toBeNull();
    },
  );

  it("checking appends the path to the stored list; unchecking removes it", async () => {
    const user = userEvent.setup();
    renderList({ paths: ["specs/c.md", "insights/z.md"] });

    await user.click(screen.getByRole("checkbox", { name: "Attach docs/a.md" }));
    expect(onSave).toHaveBeenLastCalledWith(["specs/c.md", "insights/z.md", "docs/a.md"]);

    await user.click(screen.getByRole("checkbox", { name: "Attach specs/c.md" }));
    expect(onSave).toHaveBeenLastCalledWith(["insights/z.md"]);
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("an attached path the repository does not have keeps its position, counts 0 tokens and can be detached", async () => {
    const user = userEvent.setup();
    renderList({ paths: ["docs/a.md", "gone/x.md", "specs/b.md"] });

    expect(order()).toEqual(["docs/a.md", "gone/x.md", "specs/b.md", "insights/z.md", "specs/c.md"]);
    const gone = within(rowOf("gone/x.md"));
    expect(gone.getByText("not found in acme/x")).toBeInTheDocument();
    expect(gone.queryByRole("button", { name: "Preview" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Attach gone/x.md" })).toBeEnabled();
    // 100 + 0 + 200
    expect(screen.getByText("≈ 300 tokens")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Attach gone/x.md" }));
    expect(onSave).toHaveBeenLastCalledWith(["docs/a.md", "specs/b.md"]);
  });

  it("a too_large or unreadable document cannot be attached, but an attached one can be detached", async () => {
    filesState.data = list([
      doc("docs/big.md", null, "too_large"),
      doc("docs/bad.md", null, "unreadable"),
      doc("docs/ok.md", 10),
    ]);
    const user = userEvent.setup();
    renderList({ paths: ["docs/bad.md"] });

    expect(within(rowOf("docs/big.md")).getByText("too large")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach docs/big.md" })).toBeDisabled();
    expect(within(rowOf("docs/bad.md")).getByText("cannot be read")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach docs/bad.md" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Attach docs/ok.md" })).toBeEnabled();

    await user.click(screen.getByRole("checkbox", { name: "Attach docs/big.md" }));
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Attach docs/bad.md" }));
    expect(onSave).toHaveBeenLastCalledWith([]);
  });
});

describe("ContextAttachList filter and reorder", () => {
  it("filters by path case-insensitively, says when nothing matches, and turns dragging off", async () => {
    const user = userEvent.setup();
    renderList({ paths: ["specs/c.md", "insights/z.md"] });
    expect(screen.getByText(/Drag to reorder/)).toBeInTheDocument();

    const box = screen.getByRole("searchbox", { name: "Filter documents" });
    await user.type(box, "SPECS/");
    expect(order()).toEqual(["specs/c.md", "specs/b.md"]);
    expect(screen.getByText("Clear the filter to reorder.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Drag / })).toBeNull();

    await user.clear(box);
    await user.type(box, "zzz");
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByText("No documents match 'zzz'")).toBeInTheDocument();

    await user.clear(box);
    expect(order()).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Drag specs/c.md to reorder" })).toBeInTheDocument();
  });

  it("a keyboard drag of an attached row saves the new order", async () => {
    // jsdom has no layout: give every row a box so dnd-kit can tell which row is below which.
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.tagName !== "LI") return new DOMRect(0, 0, 0, 0);
      const index = Array.from(document.querySelectorAll("li")).indexOf(this as HTMLLIElement);
      return new DOMRect(0, index * 40, 400, 40);
    });
    try {
      const user = userEvent.setup();
      renderList({ paths: ["specs/c.md", "docs/a.md", "specs/b.md"] });

      screen.getByRole("button", { name: "Drag specs/c.md to reorder" }).focus();
      await user.keyboard(" ");
      await user.keyboard("{ArrowDown}");
      await user.keyboard(" ");

      expect(onSave).toHaveBeenCalledOnce();
      expect(onSave).toHaveBeenLastCalledWith(["docs/a.md", "specs/c.md", "specs/b.md"]);
    } finally {
      rect.mockRestore();
    }
  });
});

describe("ContextAttachList totals and caps", () => {
  const big = [doc("docs/a.md", 6000), doc("docs/b.md", 6000), doc("docs/c.md", 6000), doc("docs/d.md", 500), doc("docs/e.md", 9000)];

  it("over the soft cap but under the run cap: shows the total and the badge, not the run note", () => {
    filesState.data = list(big);
    renderList({ paths: ["docs/d.md", "docs/a.md"] });
    expect(screen.getByText("≈ 6,500 tokens")).toBeInTheDocument();
    // over the 4K soft cap but under the run cap -> only the badge
    expect(screen.getByText("over 4K soft cap")).toBeInTheDocument();
    expect(screen.queryByText(/it will skip/)).toBeNull();
  });

  it("under the soft cap there is no badge", () => {
    filesState.data = list(big);
    renderList({ paths: ["docs/d.md"] });
    expect(screen.getByText("≈ 500 tokens")).toBeInTheDocument();
    expect(screen.queryByText("over 4K soft cap")).toBeNull();
  });

  it("over the run cap: names the attached documents the run will skip, in order", () => {
    filesState.data = list(big);
    renderList({ paths: ["docs/a.md", "docs/b.md", "docs/c.md", "docs/d.md"] });
    expect(screen.getByText("≈ 18,500 tokens")).toBeInTheDocument();
    expect(screen.getByText("over 4K soft cap")).toBeInTheDocument();
    expect(
      screen.getByText("A run inserts up to 16K tokens; it will skip: docs/c.md, docs/d.md"),
    ).toBeInTheDocument();
  });

  it("an attached total exactly at the soft cap is not over it", () => {
    filesState.data = list([doc("docs/a.md", 4000)]);
    renderList({ paths: ["docs/a.md"] });
    expect(screen.getByText("≈ 4,000 tokens")).toBeInTheDocument();
    expect(screen.queryByText("over 4K soft cap")).toBeNull();
  });
});

describe("ContextAttachList states", () => {
  it("without a repository offers to add one", () => {
    repoState.repoId = null;
    renderList();
    expect(screen.getByRole("link", { name: "Add a repository" })).toHaveAttribute("href", "/onboarding");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("shows skeletons while the list or the owner's paths load", () => {
    Object.assign(filesState, { data: undefined, isLoading: true });
    renderList();
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByRole("checkbox")).toBeNull();
    cleanup();

    Object.assign(filesState, { data: list([doc("docs/a.md")]), isLoading: false });
    renderList({ paths: undefined, pathsLoading: true });
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("on an error shows it with Retry, which reloads both the paths and the list; stale data is not shown", async () => {
    Object.assign(filesState, { isError: true }); // data is kept by a failed refetch
    const user = userEvent.setup();
    renderList({ paths: ["specs/c.md"] });

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load documents");
    expect(screen.queryByRole("checkbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryPaths).toHaveBeenCalledOnce();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("an error loading the owner's paths shows the same error", () => {
    renderList({ paths: undefined, pathsError: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load documents");
  });

  it("a repository that is not cloned says so and lists nothing", () => {
    filesState.data = list([], { state: "not_cloned" });
    renderList();
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("ContextAttachList preview drawer", () => {
  it("Preview opens the document with its tokens, safe content and Used by; the toggle saves like the checkbox; Esc closes", async () => {
    fileState.data = file();
    const user = userEvent.setup();
    renderList({ paths: ["specs/c.md"] });

    await user.click(within(rowOf("specs/b.md")).getByRole("button", { name: "Preview" }));
    const dialog = screen.getByRole("dialog");
    expect(fileCalls.at(-1)).toEqual(["r1", "specs/b.md"]);
    expect(within(dialog).getByText("specs/b.md")).toBeInTheDocument();
    expect(within(dialog).getByText("≈ 200 tokens")).toBeInTheDocument();
    expect(within(dialog).getByText("Used by 2 agents (1 via skill) · 2 skills")).toBeInTheDocument();
    // markdown is shown, raw HTML is text
    expect(within(dialog).getByText(/Body <b>raw<\/b> text\./)).toBeInTheDocument();
    expect(dialog.querySelector("b")).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Attach" }));
    expect(onSave).toHaveBeenLastCalledWith(["specs/c.md", "specs/b.md"]);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("for an attached document the toggle reads Attached and detaches", async () => {
    fileState.data = file({ path: "specs/c.md" });
    const user = userEvent.setup();
    renderList({ paths: ["specs/c.md", "docs/a.md"] });

    await user.click(within(rowOf("specs/c.md")).getByRole("button", { name: "Preview" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Attached" }));
    expect(onSave).toHaveBeenLastCalledWith(["docs/a.md"]);
  });

  it("for an unattached too_large document the toggle is disabled and the drawer says why there is no content", async () => {
    filesState.data = list([doc("docs/big.md", null, "too_large")]);
    fileState.data = file({ path: "docs/big.md", status: "too_large", tokens: null, content: null });
    const user = userEvent.setup();
    renderList({ paths: [] });

    await user.click(screen.getByRole("button", { name: "Preview" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Attach" })).toBeDisabled();
    expect(within(dialog).getByText("too large")).toBeInTheDocument();
  });

  it("the drawer closes with its Close button too, and Esc with no drawer open does nothing", async () => {
    fileState.data = file();
    const user = userEvent.setup();
    renderList({ paths: [] });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(within(rowOf("specs/b.md")).getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });
});
