import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrDetail, PrFile, PrReviewComment, ReviewRecord } from "@devdigest/shared";
import shell from "../../../../../../../../messages/en/shell.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

// Hook modules are mocked with stable objects: a fresh object per call would change the
// identity of `mutateAsync` / `mutate` on every render (client/INSIGHTS.md, "vitest run hangs").
// Per-test data goes through `hookData`, which is read when a hook is called. Later phases add
// their own `vi.mock` here (the smart-diff hook, `next/navigation`) and their own `hookData` field.
const hookData: { comments: PrReviewComment[]; reviews: ReviewRecord[] } = { comments: [], reviews: [] };

const createComment = { mutateAsync: vi.fn(), isPending: false };
const findingAction = { mutate: vi.fn(), isPending: false };

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: hookData.comments }),
  usePrReviews: () => ({ data: hookData.reviews }),
  useCreatePrComment: () => createComment,
  useFindingAction: () => findingAction,
}));

import { DiffTab } from "./DiffTab";

beforeEach(() => {
  hookData.comments = [];
  hookData.reviews = [];
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

function renderTab(pr: PrDetail = PR) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <DiffTab prId="pr1" pr={pr} repoFullName="acme/api" canComment />
    </NextIntlClientProvider>,
  );
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
    renderTab();
    expect(screen.getByText("Files changed")).toBeInTheDocument();
    expect(screen.getByText("2 files · +5 −1")).toBeInTheDocument();
  });

  it("uses the singular for one file", () => {
    renderTab({ ...PR, files: [CONFIG_FILE], files_count: 1, additions: 3, deletions: 1 });
    expect(screen.getByText("1 file · +3 −1")).toBeInTheDocument();
  });
});
