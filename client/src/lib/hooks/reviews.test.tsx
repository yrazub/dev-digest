import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  runsJustSettled,
  useDeleteReview,
  useDeleteRun,
  useFindingAction,
  usePrActiveRuns,
  useRunSettledRefresh,
  type ActiveRun,
} from "./reviews";

// `usePrActiveRuns` polls every 4 s while its list is non-empty. These tests never wait on that
// timer: they change the answer and re-read the query by hand. Every test unmounts and clears its
// client, so no polling query outlives it.
const clients: QueryClient[] = [];

afterEach(() => {
  for (const qc of clients.splice(0)) qc.clear();
  vi.unstubAllGlobals();
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(qc);
  // a pass-through spy: the invalidation still happens, so observed queries still refetch
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, invalidate, wrapper };
}

const RUN: ActiveRun = { run_id: "run1", agent_id: "a1", agent_name: "Security", ran_at: null };

/** `fetch` answering by URL. `active` is read at call time, so a test can change it between reads. */
function mockApi(state: { active: Record<string, ActiveRun[]> }) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const active = /\/pulls\/([^/]+)\/runs\/active$/.exec(url);
    if (active) return new Response(JSON.stringify(state.active[active[1] ?? ""] ?? []), { status: 200 });
    if (init?.method === "DELETE" || init?.method === "POST") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

type Spy = ReturnType<typeof setup>["invalidate"];

/** How many times `invalidateQueries` was called with exactly this key. */
function callsWith(spy: Spy, queryKey: readonly unknown[]): number {
  return spy.mock.calls.filter(([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(queryKey)).length;
}

function activeReads(fetch: ReturnType<typeof mockApi>, prId: string): number {
  return fetch.mock.calls.filter(([url]) => String(url).endsWith(`/pulls/${prId}/runs/active`)).length;
}

const REFRESHED_KEYS = [
  ["pr-active-runs", "pr1"],
  ["pr-runs", "pr1"],
  ["reviews", "pr1"],
  ["pr-intent", "pr1"],
  ["smart-diff", "pr1"],
] as const;

/** The refresh together with the active-run count the page reads through the same query. */
function useRefreshAndCount(prId: string | null) {
  const refresh = useRunSettledRefresh(prId);
  const count = usePrActiveRuns(prId).data?.length;
  return { refresh, count };
}

describe("runsJustSettled", () => {
  it("is true only when a non-empty list became empty", () => {
    expect(runsJustSettled(2, 0)).toBe(true);
    expect(runsJustSettled(1, 0)).toBe(true);

    expect(runsJustSettled(undefined, 0)).toBe(false);
    expect(runsJustSettled(undefined, 2)).toBe(false);
    expect(runsJustSettled(0, 0)).toBe(false);
    expect(runsJustSettled(2, 1)).toBe(false);
    expect(runsJustSettled(0, 2)).toBe(false);
    expect(runsJustSettled(2, undefined)).toBe(false);
  });
});

describe("useRunSettledRefresh", () => {
  it("invalidates nothing on a first answer with an empty list", async () => {
    const fetch = mockApi({ active: { pr1: [] } });
    const { invalidate, wrapper } = setup();
    const { result, unmount } = renderHook(() => useRefreshAndCount("pr1"), { wrapper });

    await waitFor(() => expect(result.current.count).toBe(0));

    expect(activeReads(fetch, "pr1")).toBe(1);
    expect(invalidate).not.toHaveBeenCalled();
    unmount();
  });

  it("invalidates nothing on a first answer with a running run", async () => {
    mockApi({ active: { pr1: [RUN] } });
    const { invalidate, wrapper } = setup();
    const { result, unmount } = renderHook(() => useRefreshAndCount("pr1"), { wrapper });

    await waitFor(() => expect(result.current.count).toBe(1));

    expect(invalidate).not.toHaveBeenCalled();
    unmount();
  });

  it("refreshes the five keys when the list goes from one run to none, reviews once, and again for a second run", async () => {
    const state = { active: { pr1: [RUN] } };
    const fetch = mockApi(state);
    const { qc, invalidate, wrapper } = setup();
    const { result, unmount } = renderHook(() => useRefreshAndCount("pr1"), { wrapper });
    await waitFor(() => expect(result.current.count).toBe(1));
    expect(invalidate).not.toHaveBeenCalled();

    // the run ends: the next read of the active list is empty. `refetchQueries` stands in for the
    // poll tick and, unlike `invalidateQueries`, does not add a call to the spy.
    state.active.pr1 = [];
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["pr-active-runs", "pr1"] });
    });
    await waitFor(() => expect(callsWith(invalidate, ["reviews", "pr1"])).toBe(1));

    for (const key of REFRESHED_KEYS) expect(invalidate).toHaveBeenCalledWith({ queryKey: key });

    // the refresh re-reads the empty list itself (a third read); that `0 -> 0` must not fire again
    await waitFor(() => expect(activeReads(fetch, "pr1")).toBe(3));
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(result.current.count).toBe(0);
    for (const key of REFRESHED_KEYS) expect(callsWith(invalidate, key)).toBe(1);

    // a second run starts (0 -> 1: nothing) and ends (1 -> 0: once more)
    state.active.pr1 = [RUN];
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["pr-active-runs", "pr1"] });
    });
    await waitFor(() => expect(result.current.count).toBe(1));
    expect(callsWith(invalidate, ["reviews", "pr1"])).toBe(1);

    state.active.pr1 = [];
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["pr-active-runs", "pr1"] });
    });
    await waitFor(() => expect(callsWith(invalidate, ["reviews", "pr1"])).toBe(2));
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(callsWith(invalidate, ["reviews", "pr1"])).toBe(2);
    unmount();
  });

  it("invalidates nothing when the PR changes to one whose list is empty after one whose list was not", async () => {
    mockApi({ active: { pr1: [RUN], pr2: [] } });
    const { qc, invalidate, wrapper } = setup();
    const { result, rerender, unmount } = renderHook(({ prId }) => useRefreshAndCount(prId), {
      wrapper,
      initialProps: { prId: "pr1" },
    });
    await waitFor(() => expect(result.current.count).toBe(1));

    rerender({ prId: "pr2" });
    await waitFor(() => expect(result.current.count).toBe(0));
    await waitFor(() => expect(qc.isFetching()).toBe(0));

    expect(invalidate).not.toHaveBeenCalled();
    unmount();
  });

  it("returns a function that invalidates the same five keys, and nothing without a PR id", async () => {
    mockApi({ active: { pr1: [] } });
    const withPr = setup();
    const first = renderHook(() => useRefreshAndCount("pr1"), { wrapper: withPr.wrapper });
    await waitFor(() => expect(first.result.current.count).toBe(0));
    expect(withPr.invalidate).not.toHaveBeenCalled();

    act(() => first.result.current.refresh());

    for (const key of REFRESHED_KEYS) expect(callsWith(withPr.invalidate, key)).toBe(1);
    first.unmount();

    const fetch = mockApi({ active: {} });
    const noPr = setup();
    const second = renderHook(() => useRefreshAndCount(null), { wrapper: noPr.wrapper });
    act(() => second.result.current.refresh());

    expect(noPr.invalidate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    second.unmount();
  });

  it("keeps the same function while the PR id stays the same", async () => {
    mockApi({ active: { pr1: [] } });
    const { wrapper } = setup();
    const { result, rerender, unmount } = renderHook(() => useRefreshAndCount("pr1"), { wrapper });
    await waitFor(() => expect(result.current.count).toBe(0));
    const before = result.current.refresh;

    rerender();

    expect(result.current.refresh).toBe(before);
    unmount();
  });
});

describe("mutation hooks refresh the smart diff next to the reviews", () => {
  it("useDeleteRun invalidates the run history, the reviews and the smart-diff queries of the PR", async () => {
    const fetch = mockApi({ active: {} });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDeleteRun("pr1"), { wrapper });

    act(() => result.current.mutate("run1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/runs\/run1$/);
    expect(init.method).toBe("DELETE");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["pr-runs", "pr1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reviews", "pr1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["smart-diff", "pr1"] });
  });

  it("useDeleteReview invalidates the reviews and the smart-diff queries of the PR", async () => {
    const fetch = mockApi({ active: {} });
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDeleteReview("pr1"), { wrapper });

    act(() => result.current.mutate("rev1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/reviews\/rev1$/);
    expect(init.method).toBe("DELETE");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reviews", "pr1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["smart-diff", "pr1"] });
  });

  it("useFindingAction invalidates the reviews and the smart-diff queries with a PR id, and neither without one", async () => {
    mockApi({ active: {} });
    const withPr = setup();
    const first = renderHook(() => useFindingAction(), { wrapper: withPr.wrapper });
    act(() => first.result.current.mutate({ findingId: "f1", action: "dismiss", prId: "pr1" }));
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(withPr.invalidate).toHaveBeenCalledWith({ queryKey: ["reviews", "pr1"] });
    expect(withPr.invalidate).toHaveBeenCalledWith({ queryKey: ["smart-diff", "pr1"] });

    const withoutPr = setup();
    const second = renderHook(() => useFindingAction(), { wrapper: withoutPr.wrapper });
    act(() => second.result.current.mutate({ findingId: "f1", action: "dismiss" }));
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(withoutPr.invalidate).not.toHaveBeenCalled();
  });
});
