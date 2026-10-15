import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTranslator } from "next-intl";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { blastKeys, useBlastRadius } from "./blast";
import messages from "../../../messages/en/blast.json";

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

// The hook never reads the body's shape, so a minimal marker is enough to tell responses apart.
const response = (marker: string) => ({ marker }) as unknown as BlastRadiusResponse;

describe("useBlastRadius", () => {
  it("reads GET /pulls/<id>/blast and returns the body", async () => {
    const body = response("first");
    const fetch = mockFetch(body);
    const { wrapper } = setup();
    const { result } = renderHook(() => useBlastRadius("pr1", "sha1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(url).toMatch(/\/pulls\/pr1\/blast$/);
    expect(init?.method ?? "GET").toBe("GET");
    expect(result.current.data).toEqual(body);
  });

  it("requests nothing without a PR id", () => {
    const fetch = mockFetch(response("x"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useBlastRadius(null, "sha1"), { wrapper });
    // a disabled query never leaves the idle state
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requests nothing without a head SHA", () => {
    const fetch = mockFetch(response("x"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useBlastRadius("pr1", null), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requests again for a new head SHA of the same PR instead of serving the old one", async () => {
    const fetch = vi.fn();
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(response("at-sha1")), { status: 200 }));
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(response("at-sha2")), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const { qc, wrapper } = setup();

    const { result, rerender } = renderHook(({ sha }: { sha: string }) => useBlastRadius("pr1", sha), {
      wrapper,
      initialProps: { sha: "sha1" },
    });
    await waitFor(() => expect(result.current.data).toEqual(response("at-sha1")));
    expect(fetch).toHaveBeenCalledTimes(1);

    rerender({ sha: "sha2" });
    await waitFor(() => expect(result.current.data).toEqual(response("at-sha2")));
    expect(fetch).toHaveBeenCalledTimes(2);
    // both heads stay cached under their own key
    expect(qc.getQueryData(blastKeys.detail("pr1", "sha1"))).toEqual(response("at-sha1"));
    expect(qc.getQueryData(blastKeys.detail("pr1", "sha2"))).toEqual(response("at-sha2"));
  });

  it("refetches when the PR-wide key is invalidated", async () => {
    const fetch = vi.fn();
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(response("before")), { status: 200 }));
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(response("after")), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const { qc, wrapper } = setup();

    const { result } = renderHook(() => useBlastRadius("pr1", "sha1"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(response("before")));

    await qc.invalidateQueries({ queryKey: blastKeys.pull("pr1") });
    await waitFor(() => expect(result.current.data).toEqual(response("after")));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not refetch when another PR's key is invalidated", async () => {
    const fetch = mockFetch(response("only"));
    const { qc, wrapper } = setup();

    const { result } = renderHook(() => useBlastRadius("pr1", "sha1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await qc.invalidateQueries({ queryKey: blastKeys.pull("pr2") });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("surfaces a 404 as an error", async () => {
    mockFetch({ error: { code: "not_found", message: "no such pull" } }, 404);
    const { wrapper } = setup();
    const { result } = renderHook(() => useBlastRadius("pr1", "sha1"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe("blastKeys", () => {
  it("nests the head key under the PR key, so one invalidation reaches every head", () => {
    expect(blastKeys.pull("pr1")).toEqual(["blast", "pr1"]);
    expect(blastKeys.detail("pr1", "sha1")).toEqual(["blast", "pr1", "sha1"]);
  });
});

describe("blast strings", () => {
  const t = createTranslator({ locale: "en", messages: { blast: messages }, namespace: "blast" });

  it("pluralises the four stat labels, which render the label only", () => {
    expect(t("stat.symbols", { count: 1 })).toBe("symbol");
    expect(t("stat.symbols", { count: 2 })).toBe("symbols");
    expect(t("stat.callers", { count: 1 })).toBe("caller");
    expect(t("stat.callers", { count: 0 })).toBe("callers");
    expect(t("stat.endpoints", { count: 1 })).toBe("endpoint");
    expect(t("stat.endpoints", { count: 3 })).toBe("endpoints");
    expect(t("stat.crons", { count: 1 })).toBe("cron");
    expect(t("stat.crons", { count: 2 })).toBe("crons");
  });

  it("pluralises callerCount with the number in front", () => {
    expect(t("callerCount", { count: 1 })).toBe("1 caller");
    expect(t("callerCount", { count: 5 })).toBe("5 callers");
  });

  it("pluralises moreWithoutCallers", () => {
    expect(t("moreWithoutCallers", { count: 1 })).toBe("1 more changed symbol has no callers.");
    expect(t("moreWithoutCallers", { count: 4 })).toBe("4 more changed symbols have no callers.");
  });

  it("fills the interpolated strings", () => {
    expect(t("callersCut", { limit: 20 })).toBe("Showing the first 20 callers; there may be more.");
    expect(t("openOnGithub", { file: "src/a.ts", line: 7 })).toBe("Open src/a.ts:7 on GitHub");
  });

  it("has all six degraded reasons, each with its own text", () => {
    const reasons = {
      flag_off: "The repository index is switched off on this server (REPO_INTEL_ENABLED=false).",
      index_failed: "The last indexing run failed.",
      index_partial: "The repository index is partial, so some callers may be missing.",
      repo_too_large: "The repository is too large to index fully.",
      no_data: "The repository has not been indexed yet.",
      pr_files_missing: "The changed files of this pull request are not stored yet.",
    };
    for (const [key, text] of Object.entries(reasons)) {
      expect(t.has(`degraded.reason.${key}`)).toBe(true);
      expect(t(`degraded.reason.${key}`)).toBe(text);
    }
  });
});
