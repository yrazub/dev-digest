import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  EvalOverview,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalSuiteRunList,
  EvalSuiteRunStatus,
} from "@devdigest/shared";
import {
  evalKeys,
  useAgentEvalRuns,
  useCreateEvalCase,
  useDeleteEvalCase,
  useEvalOverview,
  useEvalRun,
  useStartEvalRun,
} from "./evals";

// The run-reading hooks poll every 2 s while a run is `running`. Most tests never wait on that
// timer: they change the mocked answer and re-read the query by hand (`refetchQueries` adds no
// call to the `invalidateQueries` spy). One test drives the real interval with fake timers.
// Every test clears its client, so no polling query outlives it.
const clients: QueryClient[] = [];

afterEach(() => {
  for (const qc of clients.splice(0)) qc.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(qc);
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, invalidate, wrapper };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function run(id: string, status: EvalSuiteRunStatus, agentId = "a1"): EvalSuiteRun {
  return {
    id,
    agent_id: agentId,
    agent_name: "Security Reviewer",
    status,
    config: {
      agent_version: 3,
      system_prompt: "p",
      provider: "openai",
      model: "gpt-x",
      strategy: "single-pass",
      skills: [],
    },
    recall: status === "done" ? 0.5 : null,
    precision: status === "done" ? 1 : null,
    citation_accuracy: status === "done" ? 1 : null,
    cases_total: 4,
    cases_done: status === "running" ? 1 : 4,
    cases_passed: status === "done" ? 2 : 0,
    cases_errored: 0,
    cost_usd: null,
    started_at: "2026-10-30T10:00:00.000Z",
    finished_at: status === "running" ? null : "2026-10-30T10:01:00.000Z",
    error: null,
  } as EvalSuiteRun;
}

const list = (...runs: EvalSuiteRun[]): EvalSuiteRunList => ({ runs, total: runs.length });
const detail = (r: EvalSuiteRun): EvalSuiteRunDetail => ({ ...r, results: [] });
const overview = (runs: EvalSuiteRun[], agentRunning = false): EvalOverview => ({
  agents: [
    {
      agent_id: "a1",
      agent_name: "Security Reviewer",
      provider: "openai",
      model: "gpt-x",
      enabled: true,
      cases_total: 4,
      runs_total: runs.length,
      running: agentRunning,
      latest: null,
      recall_trend: [],
    },
  ],
  recent_runs: runs,
});

/** `fetch` answering by URL; `state` is read at call time so a test can change it between reads. */
function mockApi(state: { runs?: EvalSuiteRunList; run?: EvalSuiteRunDetail; overview?: EvalOverview }) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== "GET") {
      if (init.method === "DELETE") return new Response(null, { status: 204 });
      return json(run("new", "running"), url.endsWith("/eval-case") ? 201 : 202);
    }
    if (/\/agents\/[^/]+\/eval-runs\?/.test(url)) return json(state.runs);
    if (/\/eval-runs\/[^/?]+$/.test(url)) return json(state.run);
    if (url.endsWith("/evals/overview")) return json(state.overview);
    throw new Error(`unexpected url ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const FOUR_KEYS = (runId: string) => [
  ["eval-runs", "a1"],
  ["eval-run", runId],
  ["eval-overview"],
  ["eval-cases", "a1"],
];

const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);

describe("evalKeys", () => {
  it("has the four documented shapes", () => {
    expect(evalKeys.cases("a1")).toEqual(["eval-cases", "a1"]);
    expect(evalKeys.runs("a1", 20)).toEqual(["eval-runs", "a1", 20]);
    expect(evalKeys.run("r1")).toEqual(["eval-run", "r1"]);
    expect(evalKeys.overview()).toEqual(["eval-overview"]);
  });
});

describe("polling (R-WEB-20)", () => {
  it("re-reads the runs list every 2 s while a run is running and stops once none is", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const state = { runs: list(run("r1", "running")) };
    const fetch = mockApi(state);
    const { wrapper } = setup();
    const { result } = renderHook(() => useAgentEvalRuns("a1", 20), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetch).toHaveBeenCalledTimes(1);

    // the server's answer flips to done, and the next tick picks it up
    state.runs = list(run("r1", "done"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await waitFor(() => expect(result.current.data?.runs[0]?.status).toBe("done"));
    const readsAfterDone = fetch.mock.calls.filter(([u]) => String(u).includes("/eval-runs?")).length;
    expect(readsAfterDone).toBeGreaterThanOrEqual(2);

    // nothing is running any more: no further poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    const readsLater = fetch.mock.calls.filter(([u]) => String(u).includes("/eval-runs?")).length;
    expect(readsLater).toBe(readsAfterDone);
  });

  it("never polls a list that holds no running run", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetch = mockApi({ runs: list(run("r1", "done"), run("r0", "failed")) });
    const { wrapper } = setup();
    const { result } = renderHook(() => useAgentEvalRuns("a1", 20), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("polls the overview while an agent is marked running even with no running recent run", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetch = mockApi({ overview: overview([run("r1", "done")], true) });
    const { wrapper } = setup();
    const { result } = renderHook(() => useEvalOverview(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("requests nothing without an agent id or run id", () => {
    const fetch = mockApi({});
    const { wrapper } = setup();
    const a = renderHook(() => useAgentEvalRuns(null, 20), { wrapper });
    const b = renderHook(() => useEvalRun(undefined), { wrapper });
    expect(a.result.current.fetchStatus).toBe("idle");
    expect(b.result.current.fetchStatus).toBe("idle");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("completion invalidation (R-WEB-21)", () => {
  it("useAgentEvalRuns: running -> done invalidates the four keys, once", async () => {
    const state = { runs: list(run("r1", "running")) };
    mockApi(state);
    const { qc, invalidate, wrapper } = setup();
    const { result } = renderHook(() => useAgentEvalRuns("a1", 20), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();

    state.runs = list(run("r1", "done"));
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["eval-runs", "a1", 20] });
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
    expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining(FOUR_KEYS("r1")));
  });

  it("useAgentEvalRuns: running -> failed invalidates too", async () => {
    const state = { runs: list(run("r1", "running")) };
    mockApi(state);
    const { qc, invalidate, wrapper } = setup();
    const { result } = renderHook(() => useAgentEvalRuns("a1", 20), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    state.runs = list(run("r1", "failed"));
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["eval-runs", "a1", 20] });
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
    expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining(FOUR_KEYS("r1")));
  });

  it("a run first seen as done, and a run that stays running, invalidate nothing", async () => {
    const state = { runs: list(run("r1", "done"), run("r2", "running")) };
    mockApi(state);
    const { qc, invalidate, wrapper } = setup();
    const { result } = renderHook(() => useAgentEvalRuns("a1", 20), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(async () => {
      await qc.refetchQueries({ queryKey: ["eval-runs", "a1", 20] });
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("useEvalRun: running -> done invalidates the four keys", async () => {
    const state = { run: detail(run("r1", "running")) };
    mockApi(state);
    const { qc, invalidate, wrapper } = setup();
    const { result } = renderHook(() => useEvalRun("r1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    state.run = detail(run("r1", "done"));
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["eval-run", "r1"] });
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
    expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining(FOUR_KEYS("r1")));
  });

  it("useEvalOverview: a recent run going running -> done invalidates the four keys", async () => {
    const state = { overview: overview([run("r1", "running")], true) };
    mockApi(state);
    const { qc, invalidate, wrapper } = setup();
    const { result } = renderHook(() => useEvalOverview(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    state.overview = overview([run("r1", "done")], false);
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["eval-overview"] });
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
    expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining(FOUR_KEYS("r1")));
  });
});

describe("mutations", () => {
  it("useCreateEvalCase POSTs the finding's eval-case route and invalidates the cases key", async () => {
    const fetch = mockApi({});
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateEvalCase("a1"), { wrapper });

    await act(async () => {
      result.current.mutate("f1");
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/findings\/f1\/eval-case$/);
    expect(init.method).toBe("POST");
    expect(invalidatedKeys(invalidate)).toEqual([["eval-cases", "a1"]]);
  });

  it("useDeleteEvalCase DELETEs the case (a 204 resolves) and invalidates the cases key", async () => {
    const fetch = mockApi({});
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDeleteEvalCase("a1"), { wrapper });

    await act(async () => {
      result.current.mutate("c1");
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/eval-cases\/c1$/);
    expect(init.method).toBe("DELETE");
    expect(invalidatedKeys(invalidate)).toEqual([["eval-cases", "a1"]]);
  });

  it("useStartEvalRun POSTs the agent's eval-runs route and invalidates runs and overview", async () => {
    const fetch = mockApi({});
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useStartEvalRun("a1"), { wrapper });

    await act(async () => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/agents\/a1\/eval-runs$/);
    expect(init.method).toBe("POST");
    expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining([["eval-runs", "a1"], ["eval-overview"]]));
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("a failed start (409) surfaces its code and invalidates nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { code: "eval_run_conflict", message: "already running" } }, 409)),
    );
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useStartEvalRun("a1"), { wrapper });

    await act(async () => {
      result.current.mutate();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { code?: string }).code).toBe("eval_run_conflict");
    expect(invalidate).not.toHaveBeenCalled();
  });
});
