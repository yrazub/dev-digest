import { describe, it, expect } from "vitest";
import type { BlastRadiusResponse, DownstreamImpact } from "@devdigest/shared";
import { blastBodyMode, callerHref, groupIsCut, symbolLabel } from "./helpers";

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
    totals: { symbols: 1, callers: 1, endpoints: 0, crons: 0 },
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
      totals: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
    });
    expect(blastBodyMode({ data, isError: false })).toBe("noSymbols");
  });

  it("is noCallers when there are symbols and no downstream entry", () => {
    const data = response({
      downstream: [],
      totals: { symbols: 1, callers: 0, endpoints: 0, crons: 0 },
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
      totals: { symbols: 1, callers: 0, endpoints: 0, crons: 0 },
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
