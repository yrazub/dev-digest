import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextFile, ProjectContextList, SpecFile } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

// One stable object per hook result: the view reads function identities (`refetch`, `mutate`).
const refetch = vi.fn();
const resync = vi.fn();
const resyncMutation = { mutate: resync, isPending: false };
const filesState: {
  data: ProjectContextList | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: typeof refetch;
} = { data: undefined, isLoading: false, isError: false, isFetching: false, refetch };
const fileState: {
  data: ProjectContextFile | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: typeof refetch;
} = { data: undefined, isLoading: false, isError: false, refetch };
const fileCalls: Array<[string | null | undefined, string | null | undefined]> = [];

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { name: "x", full_name: "acme/x" } }),
}));
vi.mock("@/lib/hooks/context", () => ({
  useContextFiles: () => filesState,
  useContextFile: (repoId: string | null | undefined, path: string | null | undefined) => {
    fileCalls.push([repoId, path]);
    return fileState;
  },
}));
vi.mock("@/lib/hooks/repo-intel", () => ({ useResyncRepoIntel: () => resyncMutation }));

const router = { replace: vi.fn(), push: vi.fn() };
const nav: { search: URLSearchParams } = { search: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/repos/r1/context",
  useSearchParams: () => nav.search,
}));

import { ProjectContextView } from "./ProjectContextView";

function doc(path: string, kind: string, tokens: number | null = 100): SpecFile {
  return { path, kind, tokens, status: tokens === null ? "unreadable" : "ok" };
}

function list(over: Partial<ProjectContextList> = {}): ProjectContextList {
  return {
    state: "ready",
    roots: ["specs", "docs", "insights"],
    documents: [doc("specs/alpha.md", "specs", 1200), doc("docs/Guide.md", "docs", 300), doc("insights/log.md", "insights", 50)],
    total_tokens: 1550,
    capped: false,
    cap: 1000,
    soft_cap_tokens: 8000,
    run_cap_tokens: 16000,
    ...over,
  };
}

function file(over: Partial<ProjectContextFile> = {}): ProjectContextFile {
  return {
    path: "specs/alpha.md",
    kind: "specs",
    tokens: 1200,
    status: "ok",
    content: "# Alpha heading\n\nBody <b>raw</b> and [bad](javascript:alert(1)).",
    used_by: { agents_direct: 1, agents_via_skill: 1, skills: 1 },
    ...over,
  };
}

function viewTree() {
  return (
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextView repoId="r1" />
    </NextIntlClientProvider>
  );
}

function renderView() {
  return render(viewTree());
}

function row(path: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")) });
}

beforeEach(() => {
  refetch.mockClear();
  resync.mockClear();
  router.replace.mockClear();
  fileCalls.length = 0;
  nav.search = new URLSearchParams();
  Object.assign(filesState, { data: list(), isLoading: false, isError: false, isFetching: false });
  Object.assign(fileState, { data: undefined, isLoading: false, isError: false });
});
afterEach(cleanup);

describe("ProjectContextView", () => {
  it("lists the documents with path, a kind badge coloured per kind (neutral for a custom root) and tokens", () => {
    filesState.data = list({
      roots: ["specs", "docs", "insights", "adr"],
      documents: [
        doc("specs/alpha.md", "specs", 1200),
        doc("docs/Guide.md", "docs", 300),
        doc("insights/log.md", "insights", 50),
        doc("adr/0001.md", "adr", 7),
      ],
    });
    renderView();

    const colourOf = (path: string, kind: string) =>
      within(row(path)).getByText(kind) as HTMLElement;
    expect(within(row("specs/alpha.md")).getByText("≈ 1,200 tokens")).toBeInTheDocument();
    expect(within(row("adr/0001.md")).getByText("≈ 7 tokens")).toBeInTheDocument();
    expect(colourOf("specs/alpha.md", "specs").style.color).toBe("var(--accent)");
    expect(colourOf("docs/Guide.md", "docs")).toHaveStyle({ color: "#10b981" });
    expect(colourOf("insights/log.md", "insights")).toHaveStyle({ color: "#f59e0b" });
    expect(colourOf("adr/0001.md", "adr").style.color).toBe("var(--text-secondary)");
  });

  it("selecting a row writes ?path= to the URL", async () => {
    const user = userEvent.setup();
    renderView();
    expect(screen.getByText("Select a document to preview it")).toBeInTheDocument();
    await user.click(row("docs/Guide.md"));
    expect(router.replace).toHaveBeenCalledWith("/repos/r1/context?path=docs%2FGuide.md");
  });

  it("a ?path= on load selects that document and shows its content as safe markdown", () => {
    nav.search = new URLSearchParams({ path: "specs/alpha.md" });
    fileState.data = file();
    renderView();

    expect(fileCalls.at(-1)).toEqual(["r1", "specs/alpha.md"]);
    expect(row("specs/alpha.md")).toHaveAttribute("aria-current", "true");
    expect(row("docs/Guide.md")).not.toHaveAttribute("aria-current");
    expect(screen.queryByText("Select a document to preview it")).toBeNull();
    // raw HTML is text, a javascript: link is not an anchor
    expect(screen.getByText(/Body <b>raw<\/b> and bad\./)).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows Used by with the via-skill parenthesis only when some agents come through a skill", () => {
    nav.search = new URLSearchParams({ path: "specs/alpha.md" });
    fileState.data = file({ used_by: { agents_direct: 1, agents_via_skill: 1, skills: 1 } });
    renderView();
    expect(screen.getByText("Used by 2 agents (1 via skill) · 1 skill")).toBeInTheDocument();
    cleanup();

    fileState.data = file({ used_by: { agents_direct: 2, agents_via_skill: 0, skills: 3 } });
    renderView();
    expect(screen.getByText("Used by 2 agents · 3 skills")).toBeInTheDocument();
  });

  it("says why a selected document has no preview", () => {
    nav.search = new URLSearchParams({ path: "specs/alpha.md" });
    fileState.data = file({ content: null, status: "too_large", tokens: null });
    renderView();
    expect(screen.getByText("too large")).toBeInTheDocument();
    cleanup();

    fileState.data = file({ content: null, status: "unreadable", tokens: null });
    renderView();
    expect(screen.getByText("cannot be read")).toBeInTheDocument();
  });

  it("is view only: no New file, Upload, Edit or Delete control", () => {
    nav.search = new URLSearchParams({ path: "specs/alpha.md" });
    fileState.data = file();
    renderView();
    for (const name of [/new file/i, /upload/i, /edit/i, /delete/i]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("textbox", { name: /content/i })).toBeNull();
  });

  it("the footer counts every document and the total tokens while a filter narrows the list", async () => {
    const user = userEvent.setup();
    renderView();
    expect(screen.getByText("3 files · 1,550 tokens total")).toBeInTheDocument();

    // case-insensitive path substring
    await user.type(screen.getByRole("searchbox", { name: "Filter documents" }), "GUIDE");
    expect(row("docs/Guide.md")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /specs\/alpha\.md/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /insights\/log\.md/ })).toBeNull();
    expect(screen.getByText("3 files · 1,550 tokens total")).toBeInTheDocument();
  });

  it("uses the singular for one file", () => {
    filesState.data = list({ documents: [doc("specs/a.md", "specs", 5)], total_tokens: 5 });
    renderView();
    expect(screen.getByText("1 file · 5 tokens total")).toBeInTheDocument();
  });

  it("Refresh refetches the list", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("empty repository names the configured roots and the repository; Resync starts the job only", async () => {
    filesState.data = list({ roots: ["adr"], documents: [], total_tokens: 0 });
    const user = userEvent.setup();
    renderView();
    expect(screen.getByText("No markdown under adr/ in acme/x")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resync" }));
    expect(resync).toHaveBeenCalledOnce();
    expect(refetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("empty state lists three roots with the or-word", () => {
    filesState.data = list({ documents: [], total_tokens: 0 });
    renderView();
    expect(screen.getByText("No markdown under specs/, docs/ or insights/ in acme/x")).toBeInTheDocument();
  });

  it("not cloned: says so and offers no list", () => {
    filesState.data = list({ state: "not_cloned", documents: [], total_tokens: 0 });
    renderView();
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("loading shows skeletons and no list", () => {
    Object.assign(filesState, { data: undefined, isLoading: true });
    renderView();
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText(/files? ·/)).toBeNull();
  });

  it("error shows the failure and Retry refetches", async () => {
    Object.assign(filesState, { data: undefined, isError: true });
    const user = userEvent.setup();
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load documents");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("a failed refetch that kept its data shows the error, not the stale list", () => {
    Object.assign(filesState, { data: list(), isError: true });
    renderView();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /specs\/alpha\.md/ })).toBeNull();
  });

  it("a capped list carries the cap mark; an uncapped one does not", () => {
    filesState.data = list({ capped: true, cap: 1000 });
    renderView();
    expect(screen.getByText("Showing the first 1,000 documents")).toBeInTheDocument();
    cleanup();

    filesState.data = list({ capped: false });
    renderView();
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });

  it("a document that fails to load shows its own error, the list stays", async () => {
    nav.search = new URLSearchParams({ path: "specs/alpha.md" });
    Object.assign(fileState, { data: undefined, isError: true });
    const user = userEvent.setup();
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load this document");
    expect(row("docs/Guide.md")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("changing the selected document logs no React style-collision warning", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      nav.search = new URLSearchParams({ path: "specs/alpha.md" });
      fileState.data = file();
      const view = renderView();
      expect(row("specs/alpha.md")).toHaveAttribute("aria-current", "true");

      nav.search = new URLSearchParams({ path: "docs/Guide.md" });
      view.rerender(viewTree());

      expect(row("docs/Guide.md")).toHaveAttribute("aria-current", "true");
      expect(row("specs/alpha.md")).not.toHaveAttribute("aria-current");
      const messages = error.mock.calls.map((call) => call.map(String).join(" "));
      expect(messages.filter((m) => m.includes("style property during rerender"))).toEqual([]);
    } finally {
      error.mockRestore();
    }
  });

  it("not cloned and empty keep the Refresh button next to their message; a list with no selection prompts for one", () => {
    filesState.data = list({ state: "not_cloned", documents: [], total_tokens: 0 });
    renderView();
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    cleanup();

    filesState.data = list({ documents: [], total_tokens: 0 });
    renderView();
    expect(screen.getByText("No markdown under specs/, docs/ or insights/ in acme/x")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    cleanup();

    filesState.data = list();
    renderView();
    expect(screen.getByText("Select a document to preview it")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});
