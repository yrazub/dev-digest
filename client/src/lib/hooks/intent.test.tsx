import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrIntentRecord, PrIntentResponse } from "@devdigest/shared";
import { intentKeys, usePrIntent, useRegenerateIntent } from "./intent";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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

const record = (summary: string): PrIntentRecord => ({
  pr_id: "pr1",
  summary,
  in_scope: ["a"],
  out_of_scope: [],
  risk_areas: [],
  confidence: "high",
  sources: [],
  missing_context: false,
  injection_suspected: false,
  stale: false,
  model: null,
  cost_usd: null,
  computed_at: "2026-10-01T10:00:00.000Z",
});

describe("usePrIntent", () => {
  it("reads GET /pulls/<id>/intent", async () => {
    const body: PrIntentResponse = { intent: record("Add rate limiting") };
    const fetch = mockFetch(body);
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrIntent("pr1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(url).toMatch(/\/pulls\/pr1\/intent$/);
    expect(init?.method ?? "GET").toBe("GET");
    expect(result.current.data).toEqual(body);
  });

  it("does not request anything without a PR id", async () => {
    const fetch = mockFetch({ intent: null });
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrIntent(null), { wrapper });
    // a disabled query never leaves the idle state
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("re-reads every 4 seconds while poll is true and never otherwise", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const polled = mockFetch({ intent: null });
    const a = setup();
    const polling = renderHook(() => usePrIntent("pr1", { poll: true }), { wrapper: a.wrapper });
    await waitFor(() => expect(polling.result.current.isSuccess).toBe(true));
    expect(polled).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4100);
    await waitFor(() => expect(polled.mock.calls.length).toBeGreaterThanOrEqual(2));
    polling.unmount();

    const idle = mockFetch({ intent: null });
    const b = setup();
    const quiet = renderHook(() => usePrIntent("pr1"), { wrapper: b.wrapper });
    await waitFor(() => expect(quiet.result.current.isSuccess).toBe(true));
    await vi.advanceTimersByTimeAsync(12000);
    expect(idle).toHaveBeenCalledTimes(1);
  });
});

describe("useRegenerateIntent", () => {
  it("posts to /pulls/<id>/intent without a body and writes the response into the cache", async () => {
    const fresh: PrIntentResponse = { intent: record("Freshly derived") };
    const fetch = mockFetch(fresh);
    const { qc, wrapper } = setup();
    qc.setQueryData(intentKeys.detail("pr1"), { intent: null } satisfies PrIntentResponse);

    const { result } = renderHook(() => useRegenerateIntent("pr1"), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/pulls\/pr1\/intent$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(qc.getQueryData(["pr-intent", "pr1"])).toEqual(fresh);
  });

  it("leaves the cached intent untouched when the server refuses", async () => {
    mockFetch({ error: { code: "intent_unavailable", message: "no token" } }, 400);
    const { qc, wrapper } = setup();
    const before: PrIntentResponse = { intent: record("Stored") };
    qc.setQueryData(intentKeys.detail("pr1"), before);

    const { result } = renderHook(() => useRegenerateIntent("pr1"), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(qc.getQueryData(["pr-intent", "pr1"])).toEqual(before);
  });
});
