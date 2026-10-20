import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBriefResponse } from "@devdigest/shared";
import { briefKeys, useGenerateBrief, usePrBrief } from "./brief";

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

// The hooks never read the body's shape, so a marker is enough to tell answers apart.
const response = (marker: string) => ({ brief: { summary: marker } }) as unknown as PrBriefResponse;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Call = [string, RequestInit | undefined];

describe("briefKeys", () => {
  it("carries the PR id and the head SHA", () => {
    expect(briefKeys.detail("pr1", "sha1")).toEqual(["pr-brief", "pr1", "sha1"]);
  });
});

describe("usePrBrief", () => {
  it("sends one GET on mount and no POST", async () => {
    const fetch = vi.fn(async () => json(response("stored")));
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrBrief("pr1", "sha1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as Call;
    expect(url).toMatch(/\/pulls\/pr1\/brief$/);
    expect(init?.method ?? "GET").toBe("GET");
    expect(result.current.data).toEqual(response("stored"));
  });

  it("requests nothing without a PR id", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrBrief(null, "sha1"), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads again for a new head SHA and keeps both heads cached", async () => {
    const fetch = vi.fn();
    fetch.mockResolvedValueOnce(json(response("at-sha1")));
    fetch.mockResolvedValueOnce(json(response("at-sha2")));
    vi.stubGlobal("fetch", fetch);
    const { qc, wrapper } = setup();

    const { result, rerender } = renderHook(({ sha }: { sha: string }) => usePrBrief("pr1", sha), {
      wrapper,
      initialProps: { sha: "sha1" },
    });
    await waitFor(() => expect(result.current.data).toEqual(response("at-sha1")));
    rerender({ sha: "sha2" });
    await waitFor(() => expect(result.current.data).toEqual(response("at-sha2")));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(qc.getQueryData(briefKeys.detail("pr1", "sha1"))).toEqual(response("at-sha1"));
    expect(qc.getQueryData(briefKeys.detail("pr1", "sha2"))).toEqual(response("at-sha2"));
  });
});

describe("useGenerateBrief", () => {
  it("sends nothing until mutate is called, then POSTs once", async () => {
    const fetch = vi.fn(async () => json(response("fresh")));
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = setup();
    const { result } = renderHook(() => useGenerateBrief("pr1", "sha1"), { wrapper });
    expect(fetch).not.toHaveBeenCalled();

    await act(async () => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as Call;
    expect(url).toMatch(/\/pulls\/pr1\/brief$/);
    expect(init?.method).toBe("POST");
  });

  it("writes the response into the brief key and invalidates no other key", async () => {
    const fetch = vi.fn(async () => json(response("fresh")));
    vi.stubGlobal("fetch", fetch);
    const { qc, wrapper } = setup();
    qc.setQueryData(briefKeys.detail("pr1", "sha1"), response("old"));
    qc.setQueryData(["blast", "pr1", "sha1"], { marker: "blast" });
    qc.setQueryData(["pr-intent", "pr1"], { marker: "intent" });
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useGenerateBrief("pr1", "sha1"), { wrapper });
    await act(async () => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(qc.getQueryData(briefKeys.detail("pr1", "sha1"))).toEqual(response("fresh"));
    expect(invalidate).not.toHaveBeenCalled();
    expect(qc.getQueryState(["blast", "pr1", "sha1"])?.isInvalidated).toBe(false);
    expect(qc.getQueryState(["pr-intent", "pr1"])?.isInvalidated).toBe(false);
    // only the brief POST went out: no follow-up read
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failure as an error and leaves the cached brief alone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { code: "brief_unavailable", message: "No key" } }, 400)),
    );
    const { qc, wrapper } = setup();
    qc.setQueryData(briefKeys.detail("pr1", "sha1"), response("old"));

    const { result } = renderHook(() => useGenerateBrief("pr1", "sha1"), { wrapper });
    await act(async () => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(briefKeys.detail("pr1", "sha1"))).toEqual(response("old"));
  });
});
