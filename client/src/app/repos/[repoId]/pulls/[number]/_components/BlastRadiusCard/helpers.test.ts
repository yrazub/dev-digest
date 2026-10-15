import { describe, it, expect } from "vitest";
import type { BlastRadiusResponse, DownstreamImpact } from "@devdigest/shared";
import { GRAPH_SIZES } from "./constants";
import { blastBodyMode, callerHref, graphLayout, groupIsCut, symbolLabel, type GraphLayout } from "./helpers";

function response(over: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    changed_symbols: [{ name: "charge", file: "src/pay.ts", kind: "function" }],
    downstream: [
      {
        symbol: "charge",
        callers: [{ name: "checkout", file: "src/checkout.ts", line: 7 }],
        endpoints_affected: [],
        crons_affected: [],
      },
    ],
    summary: "",
    totals: { symbols: 1, callers: 1, endpoints: 0, crons: 0, symbols_without_callers: 0 },
    degraded: false,
    reason: null,
    indexed_sha: "idx1",
    caller_limit: 5,
    ...over,
  };
}

function group(callerCount: number): DownstreamImpact {
  return {
    symbol: "charge",
    callers: Array.from({ length: callerCount }, (_, i) => ({
      name: `c${i}`,
      file: "src/a.ts",
      line: i + 1,
    })),
    endpoints_affected: [],
    crons_affected: [],
  };
}

describe("blastBodyMode", () => {
  it("is loading without data and without an error", () => {
    expect(blastBodyMode({ data: undefined, isError: false })).toBe("loading");
  });

  it("is error for a request that never produced data", () => {
    expect(blastBodyMode({ data: undefined, isError: true })).toBe("error");
  });

  it("is noFiles when the changed files are not stored, whatever else the response holds", () => {
    const data = response({ degraded: true, reason: "pr_files_missing" });
    expect(blastBodyMode({ data, isError: false })).toBe("noFiles");
  });

  it("is noSymbols when totals.symbols is 0", () => {
    const data = response({
      changed_symbols: [],
      downstream: [],
      totals: { symbols: 0, callers: 0, endpoints: 0, crons: 0, symbols_without_callers: 0 },
    });
    expect(blastBodyMode({ data, isError: false })).toBe("noSymbols");
  });

  it("is noCallers when there are symbols and no downstream entry", () => {
    const data = response({
      downstream: [],
      totals: { symbols: 1, callers: 0, endpoints: 0, crons: 0, symbols_without_callers: 1 },
    });
    expect(blastBodyMode({ data, isError: false })).toBe("noCallers");
  });

  it("is map when there is downstream", () => {
    expect(blastBodyMode({ data: response(), isError: false })).toBe("map");
  });

  it("is map for any other degraded reason: the mark does not change the body", () => {
    const data = response({ degraded: true, reason: "index_partial" });
    expect(blastBodyMode({ data, isError: false })).toBe("map");
  });

  it("keeps the mode of the data when a refetch failed (data present, isError true)", () => {
    expect(blastBodyMode({ data: response(), isError: true })).toBe("map");
    const empty = response({
      downstream: [],
      totals: { symbols: 1, callers: 0, endpoints: 0, crons: 0, symbols_without_callers: 1 },
    });
    expect(blastBodyMode({ data: empty, isError: true })).toBe("noCallers");
  });
});

describe("callerHref", () => {
  it("pins the link to indexed_sha, with the line anchor", () => {
    expect(callerHref("acme/api", "idx1", "head1", "src/checkout.ts", 7)).toBe(
      "https://github.com/acme/api/blob/idx1/src/checkout.ts#L7",
    );
  });

  it("falls back to the head SHA when indexed_sha is null", () => {
    expect(callerHref("acme/api", null, "head1", "src/checkout.ts", 7)).toBe(
      "https://github.com/acme/api/blob/head1/src/checkout.ts#L7",
    );
  });

  it("is null without a repository name", () => {
    expect(callerHref(null, "idx1", "head1", "src/checkout.ts", 7)).toBeNull();
  });

  it("is null when neither commit is known", () => {
    expect(callerHref("acme/api", null, null, "src/checkout.ts", 7)).toBeNull();
  });

  it("encodes each path segment but keeps the separators", () => {
    expect(callerHref("acme/api", "idx1", "head1", "src/my dir/a#b?.ts", 3)).toBe(
      "https://github.com/acme/api/blob/idx1/src/my%20dir/a%23b%3F.ts#L3",
    );
  });
});

describe("groupIsCut", () => {
  it("is false below the limit", () => {
    expect(groupIsCut(group(4), 5)).toBe(false);
  });

  it("is true at the limit", () => {
    expect(groupIsCut(group(5), 5)).toBe(true);
  });
});

describe("symbolLabel", () => {
  const symbols = [
    { name: "charge", file: "a.ts", kind: "function" },
    { name: "run", file: "a.ts", kind: "method" },
    { name: "Order", file: "a.ts", kind: "class" },
  ];

  it("adds () to a function and a method", () => {
    expect(symbolLabel("charge", symbols)).toBe("charge()");
    expect(symbolLabel("run", symbols)).toBe("run()");
  });

  it("leaves another kind, and an unknown name, bare", () => {
    expect(symbolLabel("Order", symbols)).toBe("Order");
    expect(symbolLabel("ghost", symbols)).toBe("ghost");
  });
});

/**
 * Two groups that overlap on purpose: `checkout` (one file + name) calls both symbols, at two
 * different lines; `POST /pay` is an endpoint of both groups. So the layout has 2 symbols,
 * 3 callers and 2 facts (one endpoint, one cron), and 4 caller-to-symbol and 3 symbol-to-fact edges.
 */
function overlapping(): DownstreamImpact[] {
  return [
    {
      symbol: "charge",
      callers: [
        { name: "checkout", file: "src/checkout.ts", line: 7 },
        { name: "sweep", file: "src/cron.ts", line: 3 },
      ],
      endpoints_affected: ["POST /pay"],
      crons_affected: ["nightly-billing"],
    },
    {
      symbol: "refund",
      callers: [
        { name: "checkout", file: "src/checkout.ts", line: 20 },
        { name: "undo", file: "src/undo.ts", line: 5 },
      ],
      endpoints_affected: ["POST /pay"],
      crons_affected: [],
    },
  ];
}

/** Every edge as `<kind> <label> -> <kind> <label>`, sorted, so a test compares the whole set. */
function edgeSet(layout: GraphLayout): string[] {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  return layout.edges
    .map((e) => {
      const from = byId.get(e.from)!;
      const to = byId.get(e.to)!;
      return `${from.kind} ${from.label} -> ${to.kind} ${to.label}`;
    })
    .sort();
}

function labelsOf(layout: GraphLayout, kind: string): string[] {
  return layout.nodes.filter((n) => n.kind === kind).map((n) => n.label);
}

describe("graphLayout", () => {
  it("draws one node for a caller that reaches two symbols, with one edge to each", () => {
    const layout = graphLayout(overlapping(), GRAPH_SIZES);

    expect(labelsOf(layout, "caller")).toEqual(["checkout", "sweep", "undo"]);
    expect(edgeSet(layout).filter((e) => e.startsWith("caller checkout"))).toEqual([
      "caller checkout -> symbol charge",
      "caller checkout -> symbol refund",
    ]);
  });

  it("keeps two callers apart when the name or the file differs", () => {
    const downstream: DownstreamImpact[] = [
      {
        symbol: "charge",
        callers: [
          { name: "run", file: "src/a.ts", line: 1 },
          { name: "run", file: "src/b.ts", line: 1 },
          { name: "go", file: "src/a.ts", line: 2 },
        ],
        endpoints_affected: [],
        crons_affected: [],
      },
    ];

    const layout = graphLayout(downstream, GRAPH_SIZES);

    expect(labelsOf(layout, "caller")).toEqual(["run", "run", "go"]);
    expect(new Set(layout.nodes.map((n) => n.id)).size).toBe(layout.nodes.length);
  });

  it("has an edge per caller-to-symbol pair and per symbol-to-endpoint and symbol-to-cron pair, and no other", () => {
    const layout = graphLayout(overlapping(), GRAPH_SIZES);

    expect(edgeSet(layout)).toEqual([
      "caller checkout -> symbol charge",
      "caller checkout -> symbol refund",
      "caller sweep -> symbol charge",
      "caller undo -> symbol refund",
      "symbol charge -> cron nightly-billing",
      "symbol charge -> endpoint POST /pay",
      "symbol refund -> endpoint POST /pay",
    ]);
    expect(new Set(layout.edges.map((e) => e.id)).size).toBe(layout.edges.length);
  });

  it("joins no caller to an endpoint or a cron (Q6)", () => {
    const layout = graphLayout(overlapping(), GRAPH_SIZES);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const facts = new Set(["endpoint", "cron"]);

    expect(layout.edges.length).toBeGreaterThan(0);
    for (const edge of layout.edges) {
      const kinds = [byId.get(edge.from)!.kind, byId.get(edge.to)!.kind];
      expect(kinds.includes("caller") && kinds.some((k) => facts.has(k))).toBe(false);
    }
  });

  it("draws one node per distinct fact, even when two groups list it", () => {
    const layout = graphLayout(overlapping(), GRAPH_SIZES);

    expect(labelsOf(layout, "endpoint")).toEqual(["POST /pay"]);
    expect(labelsOf(layout, "cron")).toEqual(["nightly-billing"]);
    expect(labelsOf(layout, "symbol")).toEqual(["charge", "refund"]);
  });

  it("puts the changed symbols, the callers and the facts in three columns, left to right", () => {
    const layout = graphLayout(overlapping(), GRAPH_SIZES);
    const xs = (kinds: string[]) => new Set(layout.nodes.filter((n) => kinds.includes(n.kind)).map((n) => n.x));

    expect([...xs(["symbol"])]).toEqual([GRAPH_SIZES.columnX.symbol]);
    expect([...xs(["caller"])]).toEqual([GRAPH_SIZES.columnX.caller]);
    expect([...xs(["endpoint", "cron"])]).toEqual([GRAPH_SIZES.columnX.fact]);
    expect(GRAPH_SIZES.columnX.symbol).toBeLessThan(GRAPH_SIZES.columnX.caller);
    expect(GRAPH_SIZES.columnX.caller).toBeLessThan(GRAPH_SIZES.columnX.fact);
  });

  it("lets no two nodes of a column overlap, and keeps every node inside the canvas", () => {
    const layout = graphLayout(overlapping(), GRAPH_SIZES);

    const columns = new Map<number, typeof layout.nodes>();
    for (const node of layout.nodes) columns.set(node.x, [...(columns.get(node.x) ?? []), node]);
    expect(columns.size).toBe(3);
    for (const nodes of columns.values()) {
      const sorted = [...nodes].sort((a, b) => a.y - b.y);
      sorted.slice(1).forEach((node, i) => {
        expect(node.y).toBeGreaterThanOrEqual(sorted[i]!.y + sorted[i]!.height);
      });
    }
    for (const node of layout.nodes) {
      expect(node.x + node.width).toBeLessThanOrEqual(layout.width);
      expect(node.y + node.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it("gives a caller the href of its first line, and a symbol or fact none", () => {
    const hrefFor = (file: string, line: number) => `href:${file}#L${line}`;
    const layout = graphLayout(overlapping(), GRAPH_SIZES, hrefFor);

    const checkout = layout.nodes.find((n) => n.kind === "caller" && n.label === "checkout");
    expect(checkout?.href).toBe("href:src/checkout.ts#L7");
    expect(layout.nodes.find((n) => n.label === "undo")?.href).toBe("href:src/undo.ts#L5");
    expect(layout.nodes.filter((n) => n.kind !== "caller").map((n) => n.href)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("gives every caller a null href without a link builder", () => {
    const layout = graphLayout(overlapping(), GRAPH_SIZES);

    expect(layout.nodes.every((n) => n.href === null)).toBe(true);
  });

  it("cuts a label longer than labelMax with an ellipsis and keeps the whole value in title", () => {
    const long = "GET /api/public/items/with/a/very/long/path/that/never/ends";
    const downstream: DownstreamImpact[] = [
      { symbol: "charge", callers: [], endpoints_affected: [long, "GET /a"], crons_affected: [] },
    ];

    const layout = graphLayout(downstream, GRAPH_SIZES);

    const cut = layout.nodes.find((n) => n.label === long)!;
    expect(Array.from(cut.text)).toHaveLength(GRAPH_SIZES.labelMax);
    expect(cut.text.endsWith("…")).toBe(true);
    expect(long.startsWith(cut.text.slice(0, -1))).toBe(true);
    expect(cut.title).toBe(long);
    const short = layout.nodes.find((n) => n.label === "GET /a")!;
    expect(short.text).toBe("GET /a");
  });

  it("gives no nodes, no edges and no canvas for an empty downstream", () => {
    expect(graphLayout([], GRAPH_SIZES)).toEqual({ nodes: [], edges: [], width: 0, height: 0 });
  });
});
