import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTranslator } from "next-intl";
import type { SmartDiffResponse } from "@devdigest/shared";
import { smartDiffKeys, useSmartDiff } from "./smart-diff";
import messages from "../../../messages/en/prReview.json";

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
const response = (marker: string) => ({ marker }) as unknown as SmartDiffResponse;

describe("useSmartDiff", () => {
  it("reads GET /pulls/<id>/smart-diff and returns the body", async () => {
    const body = response("first");
    const fetch = mockFetch(body);
    const { wrapper } = setup();
    const { result } = renderHook(() => useSmartDiff("pr1", "sha1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(url).toMatch(/\/pulls\/pr1\/smart-diff$/);
    expect(init?.method ?? "GET").toBe("GET");
    expect(result.current.data).toEqual(body);
  });

  it("requests nothing without a PR id", () => {
    const fetch = mockFetch(response("x"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useSmartDiff(null, "sha1"), { wrapper });
    // a disabled query never leaves the idle state
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requests nothing without a head SHA", () => {
    const fetch = mockFetch(response("x"));
    const { wrapper } = setup();
    const { result } = renderHook(() => useSmartDiff("pr1", null), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("waits for the head SHA, then requests once it is known", async () => {
    const fetch = mockFetch(response("late"));
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ sha }: { sha: string | null }) => useSmartDiff("pr1", sha),
      { wrapper, initialProps: { sha: null as string | null } },
    );
    expect(fetch).not.toHaveBeenCalled();

    rerender({ sha: "sha1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("requests again for a new head SHA of the same PR instead of serving the old one", async () => {
    const fetch = vi.fn();
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(response("at-sha1")), { status: 200 }));
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(response("at-sha2")), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const { qc, wrapper } = setup();

    const { result, rerender } = renderHook(({ sha }: { sha: string }) => useSmartDiff("pr1", sha), {
      wrapper,
      initialProps: { sha: "sha1" },
    });
    await waitFor(() => expect(result.current.data).toEqual(response("at-sha1")));
    expect(fetch).toHaveBeenCalledTimes(1);

    rerender({ sha: "sha2" });
    await waitFor(() => expect(result.current.data).toEqual(response("at-sha2")));
    expect(fetch).toHaveBeenCalledTimes(2);
    // both heads stay cached under their own key
    expect(qc.getQueryData(smartDiffKeys.detail("pr1", "sha1"))).toEqual(response("at-sha1"));
    expect(qc.getQueryData(smartDiffKeys.detail("pr1", "sha2"))).toEqual(response("at-sha2"));
  });

  it("refetches when the PR-wide key is invalidated, as a finished run does", async () => {
    const fetch = vi.fn();
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(response("before")), { status: 200 }));
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(response("after")), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const { qc, wrapper } = setup();

    const { result } = renderHook(() => useSmartDiff("pr1", "sha1"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(response("before")));

    await qc.invalidateQueries({ queryKey: smartDiffKeys.pull("pr1") });
    await waitFor(() => expect(result.current.data).toEqual(response("after")));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not refetch when another PR's key is invalidated", async () => {
    const fetch = mockFetch(response("only"));
    const { qc, wrapper } = setup();

    const { result } = renderHook(() => useSmartDiff("pr1", "sha1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await qc.invalidateQueries({ queryKey: smartDiffKeys.pull("pr2") });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("surfaces a server refusal as an error", async () => {
    mockFetch({ error: { code: "not_found", message: "no such pull" } }, 404);
    const { wrapper } = setup();
    const { result } = renderHook(() => useSmartDiff("pr1", "sha1"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});

describe("smartDiffKeys", () => {
  it("nests the head key under the PR key, so one invalidation reaches every head", () => {
    expect(smartDiffKeys.pull("pr1")).toEqual(["smart-diff", "pr1"]);
    expect(smartDiffKeys.detail("pr1", "sha1")).toEqual(["smart-diff", "pr1", "sha1"]);
  });
});

describe("prReview smartDiff strings", () => {
  const t = createTranslator({ locale: "en", messages: { prReview: messages }, namespace: "prReview.smartDiff" });

  it("pluralises the file counts", () => {
    expect(t("filesCount", { count: 1 })).toBe("1 file");
    expect(t("filesCount", { count: 2 })).toBe("2 files");
    expect(t("totals", { files: 1, additions: 3, deletions: 2 })).toMatch(/^1 file · \+3 .*2$/);
    expect(t("filesWithFindings", { count: 1 })).toBe("1 file with findings");
    expect(t("filesWithFindings", { count: 4 })).toBe("4 files with findings");
  });
});
