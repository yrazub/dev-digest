import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { BlastDegradedReason, BlastRadiusResponse } from "@devdigest/shared";
import blast from "../../../../../../../../messages/en/blast.json";
import brief from "../../../../../../../../messages/en/brief.json";

// The hook module is mocked with one stable object: the component reads `refetch` from it, and a
// fresh object per call would change identity on every render (client/INSIGHTS.md, "vitest run
// hangs"). Tests change the object's fields, never replace it.
const query: {
  data: BlastRadiusResponse | undefined;
  isError: boolean;
  refetch: ReturnType<typeof vi.fn>;
} = { data: undefined, isError: false, refetch: vi.fn() };
const hookArgs = vi.fn();

vi.mock("@/lib/hooks/blast", () => ({
  useBlastRadius: (prId: string, headSha: string | null) => {
    hookArgs(prId, headSha);
    return query;
  },
}));

import { BlastRadiusCard } from "./BlastRadiusCard";

const REPO = "acme/api";
const HEAD = "headsha1";
const INDEXED = "indexedsha1";

/**
 * A map whose `totals` differ from every array length (7 symbols against 4 changed_symbols,
 * 12 callers against 3 listed, ...), so a component that recounted would show other numbers.
 * Downstream is in a different order than changed_symbols; `charge` sits at the limit of 2.
 */
function mapResponse(over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    changed_symbols: [
      { name: "charge", file: "src/pay.ts", kind: "function" },
      { name: "refund", file: "src/pay.ts", kind: "method" },
      { name: "Order", file: "src/order.ts", kind: "class" },
      { name: "audit", file: "src/audit.ts", kind: "function" },
    ],
    downstream: [
      {
        symbol: "refund",
        callers: [{ name: "undo", file: "src/undo.ts", line: 3 }],
        endpoints_affected: [],
        crons_affected: [],
      },
      {
        symbol: "charge",
        callers: [
          { name: "checkout", file: "src/my dir/checkout.ts", line: 7 },
          { name: "retry", file: "src/retry.ts", line: 21 },
        ],
        endpoints_affected: ["POST /pay", "GET /receipt"],
        crons_affected: ["nightly-billing"],
      },
    ],
    summary: "",
    totals: { symbols: 7, callers: 12, endpoints: 4, crons: 2 },
    degraded: false,
    reason: null,
    indexed_sha: INDEXED,
    caller_limit: 2,
    ...over,
  };
}

function emptyTotals(symbols: number) {
  return { symbols, callers: 0, endpoints: 0, crons: 0 };
}

beforeEach(() => {
  query.data = mapResponse();
  query.isError = false;
  query.refetch = vi.fn();
  hookArgs.mockClear();
});

afterEach(cleanup);

function renderCard(repoFullName: string | null = REPO) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast, brief }}>
      <BlastRadiusCard prId="pr1" repoFullName={repoFullName} headSha={HEAD} />
    </NextIntlClientProvider>,
  );
}

/** The summary stat whose text reads `<number> <label>` (the number is a separate element). */
function stat(text: string) {
  return screen.getAllByText((_, el) => el?.textContent === text && el.tagName === "SPAN");
}

function group(name: string) {
  return screen.getByRole("region", { name });
}

describe("BlastRadiusCard", () => {
  it("shows the four numbers of totals, not the array lengths", () => {
    renderCard();

    expect(screen.getByRole("region", { name: "Blast radius" })).toBeInTheDocument();
    expect(hookArgs).toHaveBeenCalledWith("pr1", HEAD);
    expect(stat("7 symbols").length).toBeGreaterThan(0);
    expect(stat("12 callers").length).toBeGreaterThan(0);
    expect(stat("4 endpoints").length).toBeGreaterThan(0);
    expect(stat("2 crons").length).toBeGreaterThan(0);
  });

  it("uses the singular label for a count of one", () => {
    query.data = mapResponse({ totals: { symbols: 1, callers: 1, endpoints: 1, crons: 1 } });
    renderCard();

    expect(stat("1 symbol").length).toBeGreaterThan(0);
    expect(stat("1 caller").length).toBeGreaterThan(0);
    expect(stat("1 endpoint").length).toBeGreaterThan(0);
    expect(stat("1 cron").length).toBeGreaterThan(0);
  });

  it("lists groups and callers in response order, as file:line", () => {
    renderCard();

    const names = screen
      .getAllByRole("region")
      .map((el) => el.getAttribute("aria-label"))
      .filter((n) => n !== "Blast radius");
    expect(names).toEqual(["refund()", "charge()"]);

    const callers = within(group("charge()")).getAllByRole("listitem");
    // the first list holds the callers; chips are listitems of their own named lists
    expect(callers[0]).toHaveTextContent("src/my dir/checkout.ts:7");
    expect(callers[0]).toHaveTextContent("checkout");
    expect(callers[1]).toHaveTextContent("src/retry.ts:21");
    expect(callers[1]).toHaveTextContent("retry");
  });

  it("makes a caller a new-tab link to the GitHub blob at indexed_sha", () => {
    renderCard();

    const link = within(group("charge()")).getByRole("link", { name: "src/my dir/checkout.ts:7" });
    expect(link).toHaveAttribute(
      "href",
      `https://github.com/acme/api/blob/${INDEXED}/src/my%20dir/checkout.ts#L7`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("title", "Open src/my dir/checkout.ts:7 on GitHub");
  });

  it("pins the link to the head SHA when indexed_sha is null", () => {
    query.data = mapResponse({ indexed_sha: null });
    renderCard();

    expect(within(group("refund()")).getByRole("link", { name: "src/undo.ts:3" })).toHaveAttribute(
      "href",
      `https://github.com/acme/api/blob/${HEAD}/src/undo.ts#L3`,
    );
  });

  it("shows callers as plain text, with no link, when the repository name is null", () => {
    renderCard(null);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(within(group("charge()")).getByText("src/retry.ts:21")).toBeInTheDocument();
  });

  it("puts endpoints and crons in two separately named lists", () => {
    renderCard();

    const charge = within(group("charge()"));
    const endpoints = charge.getByRole("list", { name: "endpoints" });
    expect(within(endpoints).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "POST /pay",
      "GET /receipt",
    ]);
    const crons = charge.getByRole("list", { name: "cron" });
    expect(within(crons).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "nightly-billing",
    ]);
    // the group without chips renders neither list
    expect(within(group("refund()")).queryByRole("list", { name: "endpoints" })).not.toBeInTheDocument();
    expect(within(group("refund()")).queryByRole("list", { name: "cron" })).not.toBeInTheDocument();
  });

  it("marks a group at caller_limit with + and its title, and a group below it with neither", () => {
    renderCard();

    const cut = within(group("charge()")).getByText("2 callers+");
    expect(cut).toHaveAttribute("title", "Showing the first 2 callers; there may be more.");

    const below = within(group("refund()")).getByText("1 caller");
    expect(below).not.toHaveAttribute("title");
    expect(within(group("refund()")).queryByText(/\+/)).not.toBeInTheDocument();
  });

  it("states how many changed symbols have no callers, with the plural rule", () => {
    renderCard();
    // 4 changed symbols, 2 with callers
    expect(screen.getByText("2 more changed symbols have no callers.")).toBeInTheDocument();

    cleanup();
    query.data = mapResponse({
      changed_symbols: mapResponse().changed_symbols.slice(0, 3),
    });
    renderCard();
    expect(screen.getByText("1 more changed symbol has no callers.")).toBeInTheDocument();

    cleanup();
    query.data = mapResponse({
      changed_symbols: mapResponse().changed_symbols.slice(0, 2),
    });
    renderCard();
    expect(screen.queryByText(/have no callers|has no callers/)).not.toBeInTheDocument();
  });

  it("says there are no downstream callers, with the symbol count from totals", () => {
    query.data = mapResponse({ downstream: [], totals: emptyTotals(3) });
    renderCard();

    expect(screen.getByText("3 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(stat("3 symbols").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("says no symbols are declared in the changed files", () => {
    query.data = mapResponse({ changed_symbols: [], downstream: [], totals: emptyTotals(0) });
    renderCard();

    expect(screen.getByText("No symbols are declared in the changed files.")).toBeInTheDocument();
    expect(stat("0 symbols").length).toBeGreaterThan(0);
  });

  it("shows no mark for an answer that is not degraded", () => {
    renderCard();

    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it.each<BlastDegradedReason>(["flag_off", "index_failed", "index_partial", "repo_too_large", "no_data"])(
    "shows the mark with the sentence of %s and keeps the map under it",
    (reason) => {
      query.data = mapResponse({ degraded: true, reason });
      renderCard();

      const mark = screen.getByRole("note", { name: "This map may be incomplete" });
      expect(mark).toHaveTextContent("This map may be incomplete");
      expect(mark).toHaveTextContent(
        {
          flag_off: "The repository index is switched off on this server (REPO_INTEL_ENABLED=false).",
          index_failed: "The last indexing run failed.",
          index_partial: "The repository index is partial, so some callers may be missing.",
          repo_too_large: "The repository is too large to index fully.",
          no_data: "The repository has not been indexed yet.",
        }[reason as Exclude<BlastDegradedReason, "pr_files_missing">],
      );

      // between the summary row and the map
      const firstGroup = group("refund()");
      expect(mark.compareDocumentPosition(firstGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(stat("7 symbols")[0]!.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(group("charge()")).getByRole("link", { name: "src/retry.ts:21" })).toBeInTheDocument();
    },
  );

  it("shows the mark and nothing else for pr_files_missing: no summary row, no map", () => {
    query.data = mapResponse({
      degraded: true,
      reason: "pr_files_missing",
      changed_symbols: [],
      downstream: [],
      totals: emptyTotals(0),
    });
    renderCard();

    const mark = screen.getByRole("note", { name: "This map may be incomplete" });
    expect(mark).toHaveTextContent("The changed files of this pull request are not stored yet.");
    expect(screen.queryByText(/symbols?$/)).not.toBeInTheDocument();
    expect(screen.queryByText("No symbols are declared in the changed files.")).not.toBeInTheDocument();
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("shows placeholder rows while loading, with no numbers and no error", () => {
    query.data = undefined;
    const { container } = renderCard();

    expect(screen.getByRole("region", { name: "Blast radius" })).toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton")).toHaveLength(3);
    expect(screen.queryByText(/symbols?$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("The blast radius could not be loaded.")).not.toBeInTheDocument();
  });

  it("shows the error with Try again, which refetches, when there is no data", async () => {
    const user = userEvent.setup();
    query.data = undefined;
    query.isError = true;
    renderCard();

    expect(screen.getByText("The blast radius could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText(/symbols?$/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the map when a refetch failed but data is present", () => {
    query.isError = true;
    renderCard();

    expect(screen.queryByText("The blast radius could not be loaded.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(group("charge()")).toBeInTheDocument();
    expect(stat("7 symbols").length).toBeGreaterThan(0);
  });
});
