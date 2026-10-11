import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RepoIntelState } from "@/lib/hooks/repo-intel";
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

// `blastKeys` stays the real one: the Resync tests assert on the key the note invalidates.
vi.mock("@/lib/hooks/blast", async () => ({
  ...(await vi.importActual<typeof import("@/lib/hooks/blast")>("@/lib/hooks/blast")),
  useBlastRadius: (prId: string, headSha: string | null) => {
    hookArgs(prId, headSha);
    return query;
  },
}));

// The repo-intel hooks are mocked with stable objects too: the note's effects depend on the polled
// query and on the mutation, so a fresh object per call would loop (client/INSIGHTS.md, "vitest
// run hangs"). A polled answer is simulated by changing `indexState` and re-rendering.
const OLD_STATE: RepoIntelState = {
  status: "partial",
  filesIndexed: 312,
  filesSkipped: 0,
  lastIndexedSha: "5bc45f6a6f741f21f7e7a430146a1999cf97ec45",
  updatedAt: "2026-09-21T20:28:46.312Z",
};
const indexState: { data: RepoIntelState | undefined; dataUpdatedAt: number } = {
  data: OLD_STATE,
  dataUpdatedAt: 1000,
};
const pollArgs: boolean[] = [];
const resyncMutate = vi.fn((_v: undefined, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
const resyncMutation = { mutate: resyncMutate, isPending: false };

vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: (_repoId: string, poll: boolean) => {
    pollArgs.push(poll);
    return indexState;
  },
  useResyncRepoIntel: () => resyncMutation,
}));

// The card reads the view from the URL and writes it with `router.replace`. One stable router and
// one `nav` object: tests change `nav.search`, never replace the router.
const router = { replace: vi.fn(), push: vi.fn() };
const PATHNAME = "/repos/r1/pulls/482";
const nav: { search: URLSearchParams } = { search: new URLSearchParams() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => PATHNAME,
  useSearchParams: () => nav.search,
}));

import { BlastRadiusCard } from "./BlastRadiusCard";
import { RESYNC_MAX_POLLS } from "./constants";

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

let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  indexState.data = OLD_STATE;
  indexState.dataUpdatedAt = 1000;
  pollArgs.length = 0;
  resyncMutate.mockClear();
  query.data = mapResponse();
  query.isError = false;
  query.refetch = vi.fn();
  hookArgs.mockClear();
  router.replace.mockClear();
  nav.search = new URLSearchParams();
});

afterEach(cleanup);

function card(repoFullName: string | null = REPO) {
  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={{ blast, brief }}>
        <BlastRadiusCard prId="pr1" repoId="r1" repoFullName={repoFullName} headSha={HEAD} />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

function renderCard(repoFullName: string | null = REPO) {
  return render(card(repoFullName));
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

describe("BlastRadiusCard — Tree / Graph switch and Graph view", () => {
  function graph() {
    return screen.getByRole("img", { name: "Blast radius graph" });
  }

  it("shows the tree, with Tree pressed and Graph not, when the URL has no blast parameter", () => {
    renderCard();

    expect(screen.getByRole("button", { name: "Tree", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Graph", pressed: false })).toBeInTheDocument();
    expect(group("charge()")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).not.toBeInTheDocument();
  });

  it("treats any value of blast other than graph as the tree", () => {
    nav.search = new URLSearchParams("blast=tree");
    renderCard();

    expect(screen.getByRole("button", { name: "Tree", pressed: true })).toBeInTheDocument();
    expect(group("charge()")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).not.toBeInTheDocument();
  });

  it("shows the graph and not the tree with blast=graph, with Graph pressed", () => {
    nav.search = new URLSearchParams("blast=graph");
    renderCard();

    expect(graph()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Graph", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tree", pressed: false })).toBeInTheDocument();
    // none of the tree: no group region, no "no callers" line
    expect(screen.queryByRole("region", { name: "charge()" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "refund()" })).not.toBeInTheDocument();
    expect(screen.queryByText("2 more changed symbols have no callers.")).not.toBeInTheDocument();
    // the summary row stays
    expect(stat("7 symbols").length).toBeGreaterThan(0);
  });

  it("draws the symbols, callers, endpoints and crons of the response as nodes of the graph", () => {
    nav.search = new URLSearchParams("blast=graph");
    renderCard();

    const svg = within(graph());
    for (const label of ["charge", "refund", "checkout", "retry", "undo", "POST /pay", "GET /receipt", "nightly-billing"]) {
      expect(svg.getByText(label, { selector: "text" })).toBeInTheDocument();
    }
  });

  it("makes a caller node a link with the URL, target and rel of its tree line", () => {
    renderCard();
    const treeHref = within(group("charge()"))
      .getByRole("link", { name: "src/my dir/checkout.ts:7" })
      .getAttribute("href");
    cleanup();

    nav.search = new URLSearchParams("blast=graph");
    renderCard();

    // jsdom exposes an SVG <a> as a link even inside the svg with role="img"
    const links = within(graph()).getAllByRole("link");
    expect(links).toHaveLength(3);
    const checkout = links.find((a) => a.textContent?.includes("checkout"));
    expect(checkout).toBeDefined();
    expect(checkout).toHaveAttribute("href", treeHref);
    expect(treeHref).toBe(`https://github.com/acme/api/blob/${INDEXED}/src/my%20dir/checkout.ts#L7`);
    expect(checkout).toHaveAttribute("target", "_blank");
    expect(checkout).toHaveAttribute("rel", "noopener noreferrer");
    // symbols and facts are not links
    expect(links.find((a) => a.textContent?.includes("charge"))).toBeUndefined();
    expect(links.find((a) => a.textContent?.includes("POST /pay"))).toBeUndefined();
  });

  it("draws callers as plain nodes, with no link, when the repository name is null", () => {
    nav.search = new URLSearchParams("blast=graph");
    renderCard(null);

    expect(graph()).toBeInTheDocument();
    expect(within(graph()).queryAllByRole("link")).toHaveLength(0);
    expect(within(graph()).getByText("checkout", { selector: "text" })).toBeInTheDocument();
  });

  it("names the three kinds of node in a legend", () => {
    nav.search = new URLSearchParams("blast=graph");
    renderCard();

    expect(screen.getByText("Changed symbol")).toBeInTheDocument();
    expect(screen.getByText("Caller")).toBeInTheDocument();
    expect(screen.getByText("Endpoint or cron")).toBeInTheDocument();
  });

  it("cuts a long label with an ellipsis in the node and keeps the whole value in its title", () => {
    const longEndpoint = "GET /api/public/items/with/a/very/long/path/that/never/ends";
    query.data = mapResponse({
      downstream: [
        {
          symbol: "charge",
          callers: [{ name: "checkout", file: "src/checkout.ts", line: 7 }],
          endpoints_affected: [longEndpoint],
          crons_affected: [],
        },
      ],
    });
    nav.search = new URLSearchParams("blast=graph");
    renderCard();

    const svg = within(graph());
    expect(svg.queryByText(longEndpoint, { selector: "text" })).not.toBeInTheDocument();
    expect(svg.getByText(longEndpoint, { selector: "title" })).toBeInTheDocument();
    const cut = svg.getByText(/^GET \/api\/public\/items.*…$/, { selector: "text" });
    expect(longEndpoint.startsWith((cut.textContent ?? "").slice(0, -1))).toBe(true);
  });

  it("switches to the graph with router.replace, setting blast=graph and keeping the other parameters", async () => {
    const user = userEvent.setup();
    nav.search = new URLSearchParams("tab=overview");
    renderCard();

    await user.click(screen.getByRole("button", { name: "Graph" }));

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(`${PATHNAME}?tab=overview&blast=graph`);
  });

  it("switches back to the tree by deleting blast and keeping the other parameters", async () => {
    const user = userEvent.setup();
    nav.search = new URLSearchParams("tab=overview&blast=graph&order=original");
    renderCard();

    await user.click(screen.getByRole("button", { name: "Tree" }));

    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(`${PATHNAME}?tab=overview&order=original`);
  });

  it("replaces with the bare pathname when blast was the only parameter", async () => {
    const user = userEvent.setup();
    nav.search = new URLSearchParams("blast=graph");
    renderCard();

    await user.click(screen.getByRole("button", { name: "Tree" }));

    expect(router.replace).toHaveBeenCalledWith(PATHNAME);
  });

  it("says there are no callers to graph, with the switch kept, for noCallers in the graph view", () => {
    query.data = mapResponse({ downstream: [], totals: emptyTotals(3) });
    nav.search = new URLSearchParams("blast=graph");
    renderCard();

    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
    expect(screen.queryByText("3 changed symbol(s), no downstream callers found.")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Graph", pressed: true })).toBeInTheDocument();
  });

  it("offers the switch for noCallers in the tree view too", () => {
    query.data = mapResponse({ downstream: [], totals: emptyTotals(3) });
    renderCard();

    expect(screen.getByText("3 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tree", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Graph", pressed: false })).toBeInTheDocument();
  });

  it("offers no switch for noSymbols, noFiles, loading or error, whatever the URL says", () => {
    nav.search = new URLSearchParams("blast=graph");

    query.data = mapResponse({ changed_symbols: [], downstream: [], totals: emptyTotals(0) });
    renderCard();
    expect(screen.getByText("No symbols are declared in the changed files.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tree|Graph/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Blast radius graph" })).not.toBeInTheDocument();
    cleanup();

    query.data = mapResponse({
      degraded: true,
      reason: "pr_files_missing",
      changed_symbols: [],
      downstream: [],
      totals: emptyTotals(0),
    });
    renderCard();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tree|Graph/ })).not.toBeInTheDocument();
    cleanup();

    query.data = undefined;
    renderCard();
    expect(screen.queryByRole("button", { name: /Tree|Graph/ })).not.toBeInTheDocument();
    cleanup();

    query.isError = true;
    renderCard();
    expect(screen.queryByRole("button", { name: /Tree|Graph/ })).not.toBeInTheDocument();
  });

  it("keeps the degraded mark above the graph", () => {
    query.data = mapResponse({ degraded: true, reason: "index_partial" });
    nav.search = new URLSearchParams("blast=graph");
    renderCard();

    const mark = screen.getByRole("note", { name: "This map may be incomplete" });
    expect(mark.compareDocumentPosition(graph()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("BlastRadiusCard — Resync on the mark (C6)", () => {
  const SETTLED_AT = "2026-09-21T20:31:02.100Z";

  /** Renders a degraded answer and presses Resync, as a user does. */
  async function pressResync(reason: BlastDegradedReason = "index_partial") {
    const user = userEvent.setup();
    query.data = mapResponse({ degraded: true, reason });
    const view = renderCard();
    await user.click(screen.getByRole("button", { name: "Resync index" }));
    return view;
  }

  /** One polled answer of the index state: a new `dataUpdatedAt`, with the given row `updatedAt`. */
  function answer(view: ReturnType<typeof renderCard>, updatedAt: string) {
    indexState.data = { ...OLD_STATE, updatedAt };
    indexState.dataUpdatedAt += 1;
    view.rerender(card());
  }

  it.each<[BlastDegradedReason, boolean]>([
    ["index_partial", true],
    ["index_failed", true],
    ["no_data", true],
    ["flag_off", false],
    ["repo_too_large", false],
    ["pr_files_missing", false],
  ])("for %s the Resync button is shown: %s", (reason, shown) => {
    query.data = mapResponse({ degraded: true, reason });
    renderCard();

    const button = screen.queryByRole("button", { name: "Resync index" });
    if (shown) expect(button).toBeInTheDocument();
    else expect(button).not.toBeInTheDocument();
  });

  it("shows no Resync button when the answer is not degraded", () => {
    renderCard();

    expect(screen.queryByRole("button", { name: "Resync index" })).not.toBeInTheDocument();
  });

  it("calls the resync mutation once, starts polling and shows Resyncing… on a disabled button", async () => {
    const user = userEvent.setup();
    query.data = mapResponse({ degraded: true, reason: "no_data" });
    renderCard();
    expect(pollArgs.every((poll) => !poll)).toBe(true);

    await user.click(screen.getByRole("button", { name: "Resync index" }));

    expect(resyncMutate).toHaveBeenCalledTimes(1);
    expect(pollArgs.at(-1)).toBe(true);
    const running = screen.getByRole("button", { name: "Resyncing…" });
    expect(running).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Resync index" })).not.toBeInTheDocument();
  });

  it("keeps waiting while the index row is unchanged, then invalidates the PR's blast key once and stops polling", async () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const view = await pressResync();

    answer(view, OLD_STATE.updatedAt);
    answer(view, OLD_STATE.updatedAt);
    expect(invalidate).not.toHaveBeenCalled();
    expect(pollArgs.at(-1)).toBe(true);
    expect(screen.getByRole("button", { name: "Resyncing…" })).toBeDisabled();

    answer(view, SETTLED_AT);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["blast", "pr1"] });
    expect(pollArgs.at(-1)).toBe(false);
    expect(screen.getByRole("button", { name: "Resync index" })).toBeEnabled();
    expect(screen.queryByText("The index has not changed yet. Try again in a minute.")).not.toBeInTheDocument();

    // a later render of the same answer does not invalidate again
    view.rerender(card());
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("gives up after RESYNC_MAX_POLLS unchanged answers: polling stops and the slow sentence is shown", async () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const view = await pressResync("index_failed");
    const slow = "The index has not changed yet. Try again in a minute.";

    for (let i = 0; i < RESYNC_MAX_POLLS - 1; i += 1) answer(view, OLD_STATE.updatedAt);
    expect(screen.queryByText(slow, { exact: false })).not.toBeInTheDocument();
    expect(pollArgs.at(-1)).toBe(true);
    expect(screen.getByRole("button", { name: "Resyncing…" })).toBeDisabled();

    answer(view, OLD_STATE.updatedAt);

    expect(screen.getByRole("note")).toHaveTextContent(slow);
    expect(pollArgs.at(-1)).toBe(false);
    expect(screen.getByRole("button", { name: "Resync index" })).toBeEnabled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
