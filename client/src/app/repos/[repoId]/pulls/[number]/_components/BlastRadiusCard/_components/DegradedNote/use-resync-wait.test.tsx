import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RepoIntelState } from "@/lib/hooks/repo-intel";

// The repo-intel hooks are mocked with stable objects: the hook's effect depends on the polled
// query, so a fresh object per call could loop (client/INSIGHTS.md, "vitest run hangs"). An answer
// of the polled index state is simulated by changing the fields of `status` and re-rendering:
// a good answer moves `dataUpdatedAt`, a failed one moves `errorUpdatedAt` (data stays).
const OLD_STATE: RepoIntelState = {
  status: "partial",
  filesIndexed: 312,
  filesSkipped: 0,
  lastIndexedSha: "5bc45f6a6f741f21f7e7a430146a1999cf97ec45",
  updatedAt: "2026-09-21T20:28:46.312Z",
};
const SETTLED_AT = "2026-09-21T20:31:02.100Z";

const status: { data: RepoIntelState | undefined; dataUpdatedAt: number; errorUpdatedAt: number } = {
  data: OLD_STATE,
  dataUpdatedAt: 1000,
  errorUpdatedAt: 0,
};
const pollArgs: boolean[] = [];
const resyncMutate = vi.fn((_v: undefined, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
const resyncMutation = { mutate: resyncMutate, isPending: false };

vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: (_repoId: string, poll: boolean) => {
    pollArgs.push(poll);
    return status;
  },
  useResyncRepoIntel: () => resyncMutation,
}));

import { useResyncWait } from "./use-resync-wait";
import { RESYNC_MAX_POLLS } from "../../constants";

let queryClient: QueryClient;
let rerenderHook: () => void;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  status.data = OLD_STATE;
  status.dataUpdatedAt = 1000;
  status.errorUpdatedAt = 0;
  pollArgs.length = 0;
  resyncMutate.mockClear();
});

function setup() {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useResyncWait("r1", "pr1"), { wrapper });
  rerenderHook = () => view.rerender();
  return view;
}

/** A time later than every answer so far, so two answers never share a timestamp. */
function nextAnswerTime() {
  return Math.max(status.dataUpdatedAt, status.errorUpdatedAt) + 1;
}

/** One polled answer of the index state that succeeded, with the given row `updatedAt`. */
function goodAnswer(updatedAt: string) {
  status.data = { ...OLD_STATE, updatedAt };
  status.dataUpdatedAt = nextAnswerTime();
  rerenderHook();
}

/** One polled answer that failed: the cached data stays, only `errorUpdatedAt` moves forward. */
function failedAnswer() {
  status.errorUpdatedAt = nextAnswerTime();
  rerenderHook();
}

describe("useResyncWait", () => {
  it("is not ready until the index state has loaded, and start does nothing before that", () => {
    status.data = undefined;
    status.dataUpdatedAt = 0;
    const { result } = setup();

    expect(result.current.ready).toBe(false);
    expect(result.current.running).toBe(false);
    act(() => result.current.start());
    expect(resyncMutate).not.toHaveBeenCalled();
    expect(result.current.running).toBe(false);

    status.data = OLD_STATE;
    status.dataUpdatedAt = 1000;
    rerenderHook();
    expect(result.current.ready).toBe(true);
  });

  it("start calls the resync once, turns running on and starts polling", () => {
    const { result } = setup();
    expect(result.current).toMatchObject({ ready: true, running: false, slow: false });
    expect(pollArgs.every((poll) => !poll)).toBe(true);

    act(() => result.current.start());

    expect(resyncMutate).toHaveBeenCalledTimes(1);
    expect(result.current.running).toBe(true);
    expect(result.current.slow).toBe(false);
    expect(pollArgs.at(-1)).toBe(true);
  });

  it("keeps waiting while the index row is unchanged, then invalidates the PR's blast key once and ends", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = setup();
    act(() => result.current.start());

    goodAnswer(OLD_STATE.updatedAt);
    goodAnswer(OLD_STATE.updatedAt);
    expect(result.current.running).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();
    expect(pollArgs.at(-1)).toBe(true);

    goodAnswer(SETTLED_AT);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["blast", "pr1"] });
    expect(result.current.running).toBe(false);
    expect(result.current.slow).toBe(false);
    expect(pollArgs.at(-1)).toBe(false);

    // the same answer rendered again does not invalidate a second time
    rerenderHook();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("gives up after RESYNC_MAX_POLLS unchanged answers: slow, not running, nothing invalidated", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = setup();
    act(() => result.current.start());

    for (let i = 0; i < RESYNC_MAX_POLLS - 1; i += 1) goodAnswer(OLD_STATE.updatedAt);
    expect(result.current.running).toBe(true);
    expect(result.current.slow).toBe(false);

    goodAnswer(OLD_STATE.updatedAt);

    expect(result.current.running).toBe(false);
    expect(result.current.slow).toBe(true);
    expect(pollArgs.at(-1)).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("counts failed index-state answers towards RESYNC_MAX_POLLS, so the wait ends with slow", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = setup();
    act(() => result.current.start());

    for (let i = 0; i < RESYNC_MAX_POLLS - 1; i += 1) failedAnswer();
    expect(result.current.running).toBe(true);
    expect(result.current.slow).toBe(false);

    failedAnswer();

    expect(result.current.running).toBe(false);
    expect(result.current.slow).toBe(true);
    expect(pollArgs.at(-1)).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("counts failed and unchanged answers together towards the same limit", () => {
    const { result } = setup();
    act(() => result.current.start());

    for (let i = 0; i < RESYNC_MAX_POLLS - 1; i += 1) {
      if (i % 2 === 0) failedAnswer();
      else goodAnswer(OLD_STATE.updatedAt);
    }
    expect(result.current.running).toBe(true);

    failedAnswer();

    expect(result.current.running).toBe(false);
    expect(result.current.slow).toBe(true);
  });

  it("clears slow when the user starts again", () => {
    const { result } = setup();
    act(() => result.current.start());
    for (let i = 0; i < RESYNC_MAX_POLLS; i += 1) failedAnswer();
    expect(result.current.slow).toBe(true);

    act(() => result.current.start());

    expect(resyncMutate).toHaveBeenCalledTimes(2);
    expect(result.current.slow).toBe(false);
    expect(result.current.running).toBe(true);
  });
});
