import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrReviewComment } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import type { DiffCommentApi } from "../comments";
import type { DiffFindingApi } from "../findings";
import shell from "../../../../messages/en/shell.json";
import prReview from "../../../../messages/en/prReview.json";
import { FileCard } from "./FileCard";

afterEach(cleanup);

const PATH = "src/config.ts";
// New-side numbering: 1 `const a`, 2 `const b = 3`, 3 `const c = 4`, 4 `const d`.
const PATCH = "@@ -1,3 +1,4 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;\n const d = 5;";
const FILE: PrFile = { path: PATH, additions: 2, deletions: 1, patch: PATCH };
const NO_PATCH_FILE: PrFile = { path: "assets/logo.png", additions: 0, deletions: 0, patch: null };

function finding(over: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "WARNING",
    category: "bug",
    title: `Title ${over.id}`,
    file: PATH,
    start_line: 2,
    end_line: 2,
    rationale: "because",
    confidence: 0.9,
    review_id: "rev-1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

function findingsApi(list: FindingRecord[], showFindings = true): DiffFindingApi {
  return {
    findings: list,
    showFindings,
    renderFinding: (f) => <span>{f.title}</span>,
  };
}

function ghComment(over: Partial<PrReviewComment> & { id: number }): PrReviewComment {
  return {
    path: PATH,
    line: 2,
    original_line: 2,
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

function commentingApi(comments: PrReviewComment[]): DiffCommentApi {
  return { comments, canComment: false, showComments: true, posting: false, onSubmit: vi.fn() };
}

function renderCard(props: {
  file?: PrFile;
  findings?: DiffFindingApi;
  commenting?: DiffCommentApi;
  defaultOpen?: boolean;
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell, prReview }}>
      <FileCard file={props.file ?? FILE} {...props} />
    </NextIntlClientProvider>,
  );
}

/** The rendered diff row of a line: the element that holds the line's code text. */
/** The header of the card: path, dot, stat and the GitHub comment count. */
function headerOf(path: string): HTMLElement {
  return screen.getByText(path).parentElement as HTMLElement;
}

function rowOf(codeText: string): HTMLElement {
  return screen.getByText(codeText).parentElement as HTMLElement;
}

const DOT = { name: "File has findings" };

describe("FileCard — file dot", () => {
  it("draws no dot without findings, and none for a file that has only GitHub comments", () => {
    renderCard({ commenting: commentingApi([ghComment({ id: 1 })]) });
    expect(screen.queryByRole("img", DOT)).not.toBeInTheDocument();
    expect(within(headerOf(PATH)).getByText("1")).toBeInTheDocument();
  });

  it("draws a dot named 'File has findings' for a counted finding, next to the untouched comment count", () => {
    renderCard({
      findings: findingsApi([finding({ id: "f1" })]),
      commenting: commentingApi([ghComment({ id: 1 }), ghComment({ id: 2, in_reply_to_id: 1 })]),
    });
    expect(screen.getByRole("img", DOT)).toBeInTheDocument();
    // the count is the number of GitHub comments, not comments + findings
    expect(within(headerOf(PATH)).getByText("2")).toBeInTheDocument();
    // each mark says on hover what it is, so the two are not mixed up
    expect(screen.getByRole("img", DOT)).toHaveAttribute("title", "File has findings");
    expect(within(headerOf(PATH)).getByTitle("2 comments on GitHub")).toBeInTheDocument();
  });

  it("draws no dot when the file's only finding is dismissed, but still draws its card and no tag", () => {
    renderCard({
      findings: findingsApi([finding({ id: "d", title: "Dismissed one", severity: "CRITICAL", dismissed_at: "2026-10-02T00:00:00Z" })]),
    });
    expect(screen.queryByRole("img", DOT)).not.toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
    expect(screen.getByText("Dismissed one")).toBeInTheDocument();
  });

  it("ignores findings of other files", () => {
    renderCard({ findings: findingsApi([finding({ id: "x", file: "src/other.ts", title: "Elsewhere" })]) });
    expect(screen.queryByRole("img", DOT)).not.toBeInTheDocument();
    expect(screen.queryByText("Elsewhere")).not.toBeInTheDocument();
  });
});

describe("FileCard — line tag and cards", () => {
  it.each([
    ["CRITICAL", "blocker"],
    ["WARNING", "warning"],
    ["SUGGESTION", "suggestion"],
  ] as const)("tags the line with %s as '%s'", (severity, word) => {
    renderCard({ findings: findingsApi([finding({ id: "f", severity })]) });
    expect(within(rowOf("const b = 3;")).getByText(word)).toBeInTheDocument();
  });

  it("draws the card as the next thing after the line whose new-side number is start_line", () => {
    renderCard({ findings: findingsApi([finding({ id: "f", title: "On line two", start_line: 2 })]) });
    const row = rowOf("const b = 3;");
    const next = row.nextElementSibling as HTMLElement;
    expect(within(next).getByText("On line two")).toBeInTheDocument();
    // not under the neighbouring lines
    expect(screen.getAllByText("On line two")).toHaveLength(1);
    expect(within(rowOf("const c = 4;").parentElement as HTMLElement).queryByText("On line two")).not.toBeInTheDocument();
  });

  it("draws both cards for two findings on one line, most severe first, and the tag of the most severe", () => {
    renderCard({
      findings: findingsApi([
        finding({ id: "w", title: "The warning", severity: "WARNING" }),
        finding({ id: "c", title: "The blocker", severity: "CRITICAL" }),
      ]),
    });
    const row = rowOf("const b = 3;");
    expect(within(row).getByText("blocker")).toBeInTheDocument();
    expect(within(row).queryByText("warning")).not.toBeInTheDocument();
    const cards = row.nextElementSibling as HTMLElement;
    const blocker = within(cards).getByText("The blocker");
    const warning = within(cards).getByText("The warning");
    expect(blocker.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws the stripe on the anchored line only, in the severity colour (style is the only observable)", () => {
    renderCard({ findings: findingsApi([finding({ id: "f", severity: "CRITICAL" })]) });
    expect(rowOf("const b = 3;").style.boxShadow).toContain("var(--crit)");
    expect(rowOf("const c = 4;").style.boxShadow).toBe("");
  });

  it("draws a card for a finding that sits in front of a GitHub thread on the same line", () => {
    renderCard({
      findings: findingsApi([finding({ id: "f", title: "Finding card" })]),
      commenting: commentingApi([ghComment({ id: 1, body: "gh thread body" })]),
    });
    const wrap = rowOf("const b = 3;").parentElement as HTMLElement;
    const findingCard = within(wrap).getByText("Finding card");
    const thread = within(wrap).getByText("gh thread body");
    expect(findingCard.compareDocumentPosition(thread) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("FileCard — findings outside the diff", () => {
  it("lists a finding whose line is outside the patch under 'Findings outside the diff'", () => {
    renderCard({ findings: findingsApi([finding({ id: "far", title: "Far away", start_line: 40 })]) });
    expect(screen.getByText("Findings outside the diff")).toBeInTheDocument();
    expect(screen.getByText("Far away")).toBeInTheDocument();
    // no line carries a tag for it
    expect(screen.queryByText("warning")).not.toBeInTheDocument();
  });

  it("lists the findings of a file with no patch there, with the dot", () => {
    renderCard({
      file: NO_PATCH_FILE,
      findings: findingsApi([finding({ id: "np", file: NO_PATCH_FILE.path, title: "Binary note", severity: "SUGGESTION" })]),
    });
    expect(screen.getByText("Findings outside the diff")).toBeInTheDocument();
    expect(screen.getByText("Binary note")).toBeInTheDocument();
    expect(screen.getByRole("img", DOT)).toBeInTheDocument();
  });

  it("draws no block when every finding is anchored", () => {
    renderCard({ findings: findingsApi([finding({ id: "f" })]) });
    expect(screen.queryByText("Findings outside the diff")).not.toBeInTheDocument();
  });
});

describe("FileCard — showFindings false", () => {
  it("hides every card and the outside-the-diff block, and keeps the dot and the tag", () => {
    renderCard({
      findings: findingsApi(
        [
          finding({ id: "in", title: "Inline card", severity: "CRITICAL" }),
          finding({ id: "out", title: "Outside card", start_line: 40 }),
        ],
        false,
      ),
    });
    expect(screen.queryByText("Inline card")).not.toBeInTheDocument();
    expect(screen.queryByText("Outside card")).not.toBeInTheDocument();
    expect(screen.queryByText("Findings outside the diff")).not.toBeInTheDocument();
    expect(screen.getByRole("img", DOT)).toBeInTheDocument();
    expect(within(rowOf("const b = 3;")).getByText("blocker")).toBeInTheDocument();
    expect(rowOf("const b = 3;").style.boxShadow).toContain("var(--crit)");
  });
});

describe("FileCard — defaultOpen", () => {
  it("starts collapsed with defaultOpen={false} and opens on a click on the path", async () => {
    const user = userEvent.setup();
    renderCard({ defaultOpen: false });
    expect(screen.queryByText("const b = 3;")).not.toBeInTheDocument();
    await user.click(screen.getByText(PATH));
    expect(screen.getByText("const b = 3;")).toBeInTheDocument();
  });
});

describe("FileCard — without the findings prop", () => {
  it("renders no dot, tag or block", () => {
    renderCard({});
    expect(screen.getByText("const b = 3;")).toBeInTheDocument();
    expect(screen.queryByRole("img", DOT)).not.toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
    expect(screen.queryByText("warning")).not.toBeInTheDocument();
    expect(screen.queryByText("suggestion")).not.toBeInTheDocument();
    expect(screen.queryByText("Findings outside the diff")).not.toBeInTheDocument();
    expect(rowOf("const b = 3;").style.boxShadow).toBe("");
  });
});
