import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type {
  FindingRecord,
  PrDetail,
  PrFile,
  PrReviewComment,
  ReviewRecord,
  SmartDiffResponse,
  SmartDiffRole,
} from "@devdigest/shared";
import shell from "../../../../../../../../messages/en/shell.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

// Hook modules are mocked with stable objects: a fresh object per call would change the
// identity of `mutateAsync` / `mutate` on every render (client/INSIGHTS.md, "vitest run hangs").
// Per-test data goes through `hookData`, which is read when a hook is called; each hook returns
// the same object until a test replaces it. Later phases add their own `hookData` field.
interface SmartDiffQuery {
  data: SmartDiffResponse | undefined;
  isError: boolean;
}

const hookData: {
  comments: PrReviewComment[];
  /** `undefined` is a reviews query that has not answered yet. */
  reviews: ReviewRecord[] | undefined;
  smartDiff: SmartDiffQuery;
  search: URLSearchParams;
} = {
  comments: [],
  reviews: [],
  smartDiff: { data: undefined, isError: false },
  search: new URLSearchParams(),
};

const createComment = { mutateAsync: vi.fn(), isPending: false };
const findingAction = { mutate: vi.fn(), isPending: false };
const router = { replace: vi.fn(), push: vi.fn() };
const PATHNAME = "/repos/r1/pulls/482";

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: hookData.comments }),
  usePrReviews: () => ({ data: hookData.reviews }),
  useCreatePrComment: () => createComment,
  useFindingAction: () => findingAction,
}));

vi.mock("@/lib/hooks/smart-diff", () => ({
  useSmartDiff: () => hookData.smartDiff,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => PATHNAME,
  useSearchParams: () => hookData.search,
}));

import { DiffTab } from "./DiffTab";

/** A successful smart-diff answer: one group per [role, paths] entry, in the order given. */
function smartResponse(groups: [SmartDiffRole, string[]][]): SmartDiffResponse {
  return {
    groups: groups.map(([role, paths]) => ({
      role,
      files: paths.map((path) => ({ path, additions: 1, deletions: 0, finding_lines: [] })),
    })),
    split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
  };
}

beforeEach(() => {
  hookData.comments = [];
  hookData.reviews = [];
  // Every test starts from a loaded grouping that puts both default files into core, which
  // starts open: a finding under their lines is visible without a click.
  hookData.smartDiff = { data: smartResponse([["core", [CONFIG, USERS]]]), isError: false };
  hookData.search = new URLSearchParams();
  router.replace.mockClear();
});

afterEach(cleanup);

const CONFIG = "src/config.ts";
const USERS = "src/api/users.ts";
// New-side numbering: 1 `const a`, 2 `const b = 3`, 3 `const c = 4`, 4 `const d`.
const PATCH = "@@ -1,3 +1,4 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;\n const d = 5;";

const CONFIG_FILE: PrFile = { path: CONFIG, additions: 3, deletions: 1, patch: PATCH };

const PR: PrDetail = {
  id: "pr1",
  number: 482,
  title: "Add rate limiting",
  author: "octocat",
  branch: "feature/x",
  base: "main",
  head_sha: "abc123",
  additions: 5,
  deletions: 1,
  files_count: 2,
  status: "open",
  body: null,
  files: [
    CONFIG_FILE,
    { path: USERS, additions: 2, deletions: 0, patch: PATCH },
  ],
  commits: [],
};

function finding(over: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "WARNING",
    category: "bug",
    title: `Title ${over.id}`,
    file: CONFIG,
    start_line: 2,
    end_line: 2,
    rationale: `Rationale ${over.id}`,
    suggestion: null,
    confidence: 0.9,
    review_id: "r",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function review(id: string, agent_id: string | null, created_at: string, findings: FindingRecord[]): ReviewRecord {
  return {
    id,
    pr_id: "pr1",
    agent_id,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    created_at,
    findings,
  };
}

function ghComment(over: Partial<PrReviewComment> & { id: number }): PrReviewComment {
  return {
    path: CONFIG,
    line: 3,
    original_line: 3,
    side: "RIGHT",
    body: `gh body ${over.id}`,
    user: "octocat",
    created_at: "2026-10-01T00:00:00Z",
    html_url: "https://example.test/c",
    in_reply_to_id: null,
    is_outdated: false,
    ...over,
  };
}

function tabTree(pr: PrDetail) {
  return (
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <DiffTab prId="pr1" pr={pr} repoFullName="acme/api" canComment />
    </NextIntlClientProvider>
  );
}

function renderTab(pr: PrDetail = PR) {
  return render(tabTree(pr));
}

/** The rendered diff row of a line: the element that holds the line's code text. */
function rowOf(codeText: string): HTMLElement {
  return screen.getAllByText(codeText)[0]?.parentElement as HTMLElement;
}

describe("DiffTab — findings under their lines", () => {
  it("draws a finding of the newest review under its line, and none of an older review of the same agent", () => {
    hookData.reviews = [
      review("r-new", "a1", "2026-10-03T10:00:00Z", [
        finding({ id: "new", title: "Newest finding", severity: "CRITICAL", rationale: "Why the newest matters" }),
      ]),
      review("r-old", "a1", "2026-10-01T10:00:00Z", [finding({ id: "old", title: "Stale finding" })]),
    ];
    renderTab();

    const row = rowOf("const b = 3;");
    // the card is the next thing after the line whose new-side number is start_line
    const card = row.nextElementSibling as HTMLElement;
    expect(within(card).getByText("Newest finding")).toBeInTheDocument();
    expect(within(card).getByText("Why the newest matters")).toBeInTheDocument();
    // severity: the line's tag, from the most severe counted finding
    expect(within(row).getByText("blocker")).toBeInTheDocument();
    expect(screen.queryByText("Stale finding")).not.toBeInTheDocument();
  });

  it("draws a finding whose file is not in the PR nowhere", () => {
    hookData.reviews = [
      review("r", "a1", "2026-10-03T10:00:00Z", [finding({ id: "x", title: "Elsewhere", file: "src/not-in-pr.ts" })]),
    ];
    renderTab();
    expect(screen.queryByText("Elsewhere")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "File has findings" })).not.toBeInTheDocument();
  });
});

describe("DiffTab — the comments switch", () => {
  it("is on at first render and counts GitHub comments plus counted findings in the diff", () => {
    hookData.comments = [ghComment({ id: 1 })];
    hookData.reviews = [
      review("r", "a1", "2026-10-03T10:00:00Z", [
        finding({ id: "counted" }),
        finding({ id: "dismissed", title: "Dismissed one", start_line: 3, dismissed_at: "2026-10-04T00:00:00Z" }),
        finding({ id: "outside", file: "src/not-in-pr.ts" }),
      ]),
    ];
    renderTab();

    // 1 comment + 1 counted finding: the dismissed one and the one outside the PR do not count
    expect(screen.getByRole("button", { name: /Hide comments \(2\)/ })).toBeInTheDocument();
    expect(screen.getByText("gh body 1")).toBeInTheDocument();
    expect(screen.getByText("Title counted")).toBeInTheDocument();
    // a dismissed finding keeps its card
    expect(screen.getByText("Dismissed one")).toBeInTheDocument();
  });

  it("hides the GitHub thread and the finding card together, keeps the dot and the tag, and brings them back", async () => {
    const user = userEvent.setup();
    hookData.comments = [ghComment({ id: 1 })];
    hookData.reviews = [
      review("r", "a1", "2026-10-03T10:00:00Z", [finding({ id: "f", title: "Card title", severity: "WARNING" })]),
    ];
    renderTab();
    expect(screen.getByText("Card title")).toBeInTheDocument();
    expect(screen.getByText("gh body 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Hide comments \(2\)/ }));

    expect(screen.queryByText("Card title")).not.toBeInTheDocument();
    expect(screen.queryByText("gh body 1")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "File has findings" })).toBeInTheDocument();
    expect(within(rowOf("const b = 3;")).getByText("warning")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show comments \(2\)/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Show comments \(2\)/ }));

    expect(screen.getByText("Card title")).toBeInTheDocument();
    expect(screen.getByText("gh body 1")).toBeInTheDocument();
  });

  it("is not shown with no comment and no counted finding", () => {
    hookData.reviews = [
      review("r", "a1", "2026-10-03T10:00:00Z", [
        finding({ id: "d", title: "Dismissed only", dismissed_at: "2026-10-04T00:00:00Z" }),
        finding({ id: "o", file: "src/not-in-pr.ts" }),
      ]),
    ];
    renderTab();
    expect(screen.queryByRole("button", { name: /(Show|Hide) comments/ })).not.toBeInTheDocument();
  });
});

describe("DiffTab — header", () => {
  it("labels the section and reads the totals row from the PR", () => {
    // The flat list carries the plain "Files changed" label; with groups shown it reads
    // "Smart Diff · grouped by role" (plan, phase 7, DiffTab.tsx row).
    hookData.search = new URLSearchParams("order=original");
    renderTab();
    expect(screen.getByText("Files changed")).toBeInTheDocument();
    expect(screen.getByText("2 files · +5 −1")).toBeInTheDocument();
  });

  it("uses the singular for one file", () => {
    renderTab({ ...PR, files: [CONFIG_FILE], files_count: 1, additions: 3, deletions: 1 });
    expect(screen.getByText("1 file · +3 −1")).toBeInTheDocument();
  });
});

// ---- Phase 7: groups by role and the order switch ----

const RATELIMIT_TEST = "src/middleware/ratelimit.test.ts";
const PUBLIC_INDEX = "src/api/public/index.ts";
const README = "README.md";
const LOCK = "package-lock.json";
const LOCK_PATCH = '@@ -1,2 +1,2 @@\n {\n-"lockfileVersion": 2,\n+"lockfileVersion": 3,';
const LOCK_LINE = '"lockfileVersion": 3,';

function file(path: string, patch: string | null = PATCH): PrFile {
  return { path, additions: 2, deletions: 1, patch };
}

// `pr.files` deliberately differs from the grouped order: the original order is the one below.
const ORIGINAL_ORDER = [LOCK, README, CONFIG, RATELIMIT_TEST, USERS, PUBLIC_INDEX];
const GROUPED_PR: PrDetail = {
  ...PR,
  files_count: 6,
  additions: 12,
  deletions: 6,
  files: [
    file(LOCK, LOCK_PATCH),
    file(README),
    file(CONFIG),
    file(RATELIMIT_TEST),
    file(USERS),
    file(PUBLIC_INDEX),
  ],
};

function fullResponse(): SmartDiffResponse {
  return smartResponse([
    ["core", [CONFIG, USERS]],
    ["tests", [RATELIMIT_TEST]],
    ["wiring", [PUBLIC_INDEX]],
    ["docs", [README]],
    ["boilerplate", [LOCK]],
  ]);
}

/** The group headers: the only buttons that carry `aria-expanded`. */
function groupHeaders(): HTMLElement[] {
  return screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"));
}

function queryGroupHeaders(): HTMLElement[] {
  return screen.queryAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"));
}

/** Header at `index`, failing the test with a clear message when it is missing. */
function headerAt(index: number): HTMLElement {
  const header = groupHeaders()[index];
  if (!header) throw new Error(`no group header at index ${index}`);
  return header;
}

function pathsInDomOrder(paths: string[]): boolean {
  const nodes = paths.map((p) => screen.getByText(p));
  return nodes.every((node, i) => {
    const prev = nodes[i - 1];
    return !prev || Boolean(prev.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
}

describe("DiffTab — groups by role", () => {
  it("renders one header per group in the response order, with label, hint and file count", () => {
    hookData.smartDiff = { data: fullResponse(), isError: false };
    renderTab(GROUPED_PR);

    const headers = groupHeaders();
    expect(headers).toHaveLength(5);
    const expected: [string, string, string][] = [
      ["Core", "The substance of the change — review closely", "2 files"],
      ["Tests", "Checks for the change", "1 file"],
      ["Wiring", "Hooks the core into the app", "1 file"],
      ["Docs", "Explains the change — read for context", "1 file"],
      ["Boilerplate", "Generated or mechanical — skim", "1 file"],
    ];
    expected.forEach(([label, hint, count], i) => {
      const header = headerAt(i);
      expect(within(header).getByText(label)).toBeInTheDocument();
      expect(within(header).getByText(hint)).toBeInTheDocument();
      expect(within(header).getByText(count)).toBeInTheDocument();
    });
    expect(screen.getByText("Smart Diff · grouped by role")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smart order", pressed: true })).toBeInTheDocument();
  });

  it("renders no header for a group with no files, nor for one whose files are not in the PR", () => {
    hookData.smartDiff = {
      data: smartResponse([
        ["core", [CONFIG, USERS]],
        ["tests", [RATELIMIT_TEST]],
        ["wiring", []],
        ["docs", ["docs/not-in-this-pr.md"]],
        ["boilerplate", [LOCK]],
      ]),
      isError: false,
    };
    renderTab(GROUPED_PR);

    const headers = groupHeaders();
    expect(headers).toHaveLength(3);
    expect(headers.map((h) => h.textContent)).toEqual([
      expect.stringContaining("Core"),
      expect.stringContaining("Tests"),
      expect.stringContaining("Boilerplate"),
    ]);
    expect(screen.queryByText("Wiring")).not.toBeInTheDocument();
    expect(screen.queryByText("Docs")).not.toBeInTheDocument();
    expect(screen.queryByText("docs/not-in-this-pr.md")).not.toBeInTheDocument();
  });

  it("starts Docs and Boilerplate collapsed with their files absent, and a click opens Boilerplate onto a collapsed card", async () => {
    const user = userEvent.setup();
    hookData.smartDiff = { data: fullResponse(), isError: false };
    renderTab(GROUPED_PR);

    expect(headerAt(0)).toHaveAttribute("aria-expanded", "true");
    expect(headerAt(1)).toHaveAttribute("aria-expanded", "true");
    expect(headerAt(2)).toHaveAttribute("aria-expanded", "true");
    expect(headerAt(3)).toHaveAttribute("aria-expanded", "false");
    expect(headerAt(4)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(README)).not.toBeInTheDocument();
    expect(screen.queryByText(LOCK)).not.toBeInTheDocument();
    // an open group shows its file, expanded by the size rule
    expect(screen.getByText(CONFIG)).toBeInTheDocument();
    expect(screen.getAllByText("const b = 3;").length).toBeGreaterThan(0);

    await user.click(headerAt(4));

    expect(headerAt(4)).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(LOCK)).toBeInTheDocument();
    // the card itself starts collapsed: its patch is not drawn
    expect(screen.queryByText(LOCK_LINE)).not.toBeInTheDocument();
    // Docs stays as it was
    expect(headerAt(3)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(README)).not.toBeInTheDocument();

    await user.click(screen.getByText(LOCK));
    expect(screen.getByText(LOCK_LINE)).toBeInTheDocument();
  });

  it("marks a group by its number of files with a counted finding, and a group without one gets no mark", () => {
    hookData.smartDiff = { data: fullResponse(), isError: false };
    hookData.reviews = [
      review("r", "a1", "2026-10-03T10:00:00Z", [
        finding({ id: "c1", file: CONFIG, severity: "SUGGESTION" }),
        finding({ id: "c2", file: CONFIG, start_line: 3, severity: "WARNING" }),
        finding({ id: "u1", file: USERS, severity: "CRITICAL" }),
        // the tests group only has a dismissed finding: no counted one, so no mark
        finding({ id: "t1", file: RATELIMIT_TEST, dismissed_at: "2026-10-04T00:00:00Z" }),
      ]),
    ];
    renderTab(GROUPED_PR);

    // three findings in two files: the mark counts files
    expect(within(headerAt(0)).getByRole("img", { name: "2 files with findings" })).toBeInTheDocument();
    for (const i of [1, 2, 3, 4]) {
      expect(within(headerAt(i)).queryByRole("img")).not.toBeInTheDocument();
    }
  });

  it("lists a PrFile that the response does not mention after the last group, without a header", () => {
    const stray = "src/stray.ts";
    hookData.smartDiff = { data: fullResponse(), isError: false };
    renderTab({ ...GROUPED_PR, files: [...GROUPED_PR.files, file(stray)], files_count: 7 });

    expect(groupHeaders()).toHaveLength(5);
    const lastHeader = headerAt(4);
    const strayPath = screen.getByText(stray);
    expect(lastHeader.compareDocumentPosition(strayPath) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // and not inside any group's body
    expect(screen.getAllByText(CONFIG).length).toBeGreaterThan(0);
    expect(strayPath.closest("button")).toBeNull();
  });
});

describe("DiffTab — the order switch", () => {
  it("writes order=original with router.replace, keeping the other parameters", async () => {
    const user = userEvent.setup();
    hookData.smartDiff = { data: fullResponse(), isError: false };
    hookData.search = new URLSearchParams("tab=diff");
    renderTab(GROUPED_PR);

    await user.click(screen.getByRole("button", { name: "Original order" }));

    expect(router.replace).toHaveBeenCalledTimes(1);
    const target = new URL(String(router.replace.mock.calls[0]?.[0]), "http://localhost");
    expect(target.pathname).toBe(PATHNAME);
    expect(target.searchParams.get("order")).toBe("original");
    expect(target.searchParams.get("tab")).toBe("diff");
  });

  it("with order=original lists every file flat in the order of the PR, still draws findings, and presses Original order", () => {
    hookData.smartDiff = { data: fullResponse(), isError: false };
    hookData.search = new URLSearchParams("tab=diff&order=original");
    hookData.reviews = [
      review("r", "a1", "2026-10-03T10:00:00Z", [finding({ id: "f", title: "Still drawn" })]),
    ];
    renderTab(GROUPED_PR);

    expect(queryGroupHeaders()).toHaveLength(0);
    expect(pathsInDomOrder(ORIGINAL_ORDER)).toBe(true);
    expect(screen.getByText("Still drawn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Original order", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smart order", pressed: false })).toBeInTheDocument();
    expect(screen.getByText("Files changed")).toBeInTheDocument();
  });

  it("brings the groups back: a click on Smart order replaces the URL without order", async () => {
    const user = userEvent.setup();
    hookData.smartDiff = { data: fullResponse(), isError: false };
    hookData.search = new URLSearchParams("tab=diff&order=original");
    renderTab(GROUPED_PR);

    await user.click(screen.getByRole("button", { name: "Smart order" }));

    expect(router.replace).toHaveBeenCalledTimes(1);
    const target = new URL(String(router.replace.mock.calls[0]?.[0]), "http://localhost");
    expect(target.pathname).toBe(PATHNAME);
    expect(target.searchParams.has("order")).toBe(false);
    expect(target.searchParams.get("tab")).toBe("diff");
  });
});

describe("DiffTab — smart-diff states", () => {
  it("while the grouping loads keeps the totals row and the switch, and lists no file", () => {
    hookData.smartDiff = { data: undefined, isError: false };
    renderTab(GROUPED_PR);

    expect(screen.getByText("6 files · +12 −6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smart order" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Original order" })).toBeInTheDocument();
    expect(queryGroupHeaders()).toHaveLength(0);
    for (const path of ORIGINAL_ORDER) expect(screen.queryByText(path)).not.toBeInTheDocument();
    expect(screen.queryByText("No changed files.")).not.toBeInTheDocument();
  });

  it("when the grouping fails shows the flat list in the order of the PR and says grouping is unavailable", () => {
    hookData.smartDiff = { data: undefined, isError: true };
    renderTab(GROUPED_PR);

    expect(screen.getByText("Grouping is unavailable — showing the original order")).toBeInTheDocument();
    expect(queryGroupHeaders()).toHaveLength(0);
    expect(pathsInDomOrder(ORIGINAL_ORDER)).toBe(true);
    expect(screen.getByText("Files changed")).toBeInTheDocument();
  });

  // Spec "States": a refetch that failed while a grouping is already loaded keeps the groups, with
  // no notice. The old code drew the flat list and the groups together, so every file showed twice.
  it("when a refetch fails after a grouping loaded keeps the groups, draws each file once, and shows no notice", () => {
    hookData.smartDiff = { data: fullResponse(), isError: true };
    renderTab(GROUPED_PR);

    expect(groupHeaders()).toHaveLength(5);
    expect(screen.getByText("Smart Diff · grouped by role")).toBeInTheDocument();
    expect(screen.queryByText("Files changed")).not.toBeInTheDocument();
    expect(screen.queryByText("Grouping is unavailable — showing the original order")).not.toBeInTheDocument();
    // the files of the open groups; Docs and Boilerplate start collapsed
    for (const path of [CONFIG, USERS, RATELIMIT_TEST, PUBLIC_INDEX]) {
      expect(screen.getAllByText(path)).toHaveLength(1);
    }
  });

  it("with the request failed, no grouping and no files prints No changed files and no notice", () => {
    hookData.smartDiff = { data: undefined, isError: true };
    renderTab({ ...PR, files: [], files_count: 0, additions: 0, deletions: 0 });

    expect(screen.getByText("No changed files.")).toBeInTheDocument();
    expect(screen.queryByText("Grouping is unavailable — showing the original order")).not.toBeInTheDocument();
    expect(queryGroupHeaders()).toHaveLength(0);
  });

  it("with no files prints No changed files and no group header", () => {
    hookData.smartDiff = { data: fullResponse(), isError: false };
    renderTab({ ...PR, files: [], files_count: 0, additions: 0, deletions: 0 });

    expect(screen.getByText("No changed files.")).toBeInTheDocument();
    expect(queryGroupHeaders()).toHaveLength(0);
  });
});

// ---- Phase 9: the "no review yet" line (C3) and the refresh after a run (C4) ----

const NO_REVIEW_YET = "No review has run yet — findings appear here after Run Review";

describe("DiffTab — the no-review-yet line (C3)", () => {
  it("shows the line, no dot, no group mark and no switch when the reviews query answered with an empty list, in smart order", () => {
    hookData.reviews = [];
    renderTab();

    expect(screen.getByText(NO_REVIEW_YET)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "File has findings" })).not.toBeInTheDocument();
    expect(within(headerAt(0)).queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /(Show|Hide) comments/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/with findings/)).not.toBeInTheDocument();
  });

  it("shows the line in Original order too", () => {
    hookData.reviews = [];
    hookData.search = new URLSearchParams("order=original");
    renderTab();

    expect(screen.getByText(NO_REVIEW_YET)).toBeInTheDocument();
    expect(queryGroupHeaders()).toHaveLength(0);
  });

  it("does not show the line when a review exists, in either order", () => {
    hookData.reviews = [review("r", "a1", "2026-10-03T10:00:00Z", [finding({ id: "f" })])];
    const first = renderTab();
    expect(screen.queryByText(NO_REVIEW_YET)).not.toBeInTheDocument();
    first.unmount();

    hookData.search = new URLSearchParams("order=original");
    renderTab();
    expect(screen.queryByText(NO_REVIEW_YET)).not.toBeInTheDocument();
  });

  it("does not show the line while the reviews query is still loading", () => {
    hookData.reviews = undefined;
    renderTab();

    expect(screen.queryByText(NO_REVIEW_YET)).not.toBeInTheDocument();
    // the rest of the tab is there
    expect(screen.getByText("2 files · +5 −1")).toBeInTheDocument();
    expect(screen.getByText(CONFIG)).toBeInTheDocument();
  });

  it("does not show the line for a review that has no findings", () => {
    hookData.reviews = [review("r", "a1", "2026-10-03T10:00:00Z", [])];
    renderTab();

    expect(screen.queryByText(NO_REVIEW_YET)).not.toBeInTheDocument();
  });
});

describe("DiffTab — a review arriving in the same mounted tab (C4)", () => {
  it("draws the file's dot and the Core header's mark, and drops the no-review line, when the reviews data changes", () => {
    hookData.reviews = [];
    const view = renderTab();
    expect(screen.getByText(NO_REVIEW_YET)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "File has findings" })).not.toBeInTheDocument();
    expect(within(headerAt(0)).queryByRole("img")).not.toBeInTheDocument();

    // a finished run: the refreshed reviews query now holds a review with a finding in a core file
    hookData.reviews = [
      review("r", "a1", "2026-10-03T10:00:00Z", [finding({ id: "fresh", title: "Fresh finding", file: CONFIG })]),
    ];
    view.rerender(tabTree(PR));

    expect(screen.queryByText(NO_REVIEW_YET)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "File has findings" })).toBeInTheDocument();
    expect(within(headerAt(0)).getByRole("img", { name: "1 file with findings" })).toBeInTheDocument();
    expect(screen.getByText("Fresh finding")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hide comments \(1\)/ })).toBeInTheDocument();
  });
});
