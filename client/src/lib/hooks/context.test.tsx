import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { contextKeys, useAgentContext, useSetAgentContext, useSetSkillContext } from "./context";

// `fetch` is mocked; every PUT is held until the test settles it, so a test decides what is "in flight".
const clients: QueryClient[] = [];

afterEach(() => {
  for (const qc of clients.splice(0)) qc.clear();
  vi.unstubAllGlobals();
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

interface HeldPut {
  url: string;
  paths: string[];
  /** The server answers with this list. */
  ok: (paths?: string[]) => Promise<void>;
  /** The server answers 500. */
  fail: () => Promise<void>;
}

/** A `fetch` whose PUTs wait for the test; `puts` lists them in the order they were sent. */
function holdPuts(get: Record<string, unknown> = {}) {
  const puts: HeldPut[] = [];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method !== "PUT") {
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      return Promise.resolve(new Response(JSON.stringify(get[path] ?? {}), { status: 200 }));
    }
    const paths = (JSON.parse(String(init.body)) as { paths: string[] }).paths;
    return new Promise<Response>((resolve) => {
      const settle = async (res: Response) => {
        await act(async () => resolve(res));
      };
      puts.push({
        url,
        paths,
        ok: (answer) => settle(new Response(JSON.stringify({ paths: answer ?? paths }), { status: 200 })),
        fail: () =>
          settle(new Response(JSON.stringify({ error: { code: "boom", message: "boom" } }), { status: 500 })),
      });
    });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, puts };
}

const KEY = contextKeys.agent("a1");
const lastPut = (puts: HeldPut[]): HeldPut => {
  const p = puts.at(-1);
  if (!p) throw new Error("no PUT was sent");
  return p;
};
const putCount = (fn: ReturnType<typeof holdPuts>["fn"]) =>
  fn.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT").length;

function callsWith(spy: ReturnType<typeof setup>["invalidate"], queryKey: readonly unknown[]): number {
  return spy.mock.calls.filter(([f]) => JSON.stringify(f?.queryKey) === JSON.stringify(queryKey)).length;
}

describe("useSetAgentContext", () => {
  it("three quick saves during one in-flight PUT send exactly two PUTs, the second with the last list", async () => {
    const { qc, wrapper } = setup();
    const { fn, puts } = holdPuts();
    qc.setQueryData(KEY, { paths: ["x"] });
    const { result } = renderHook(() => useSetAgentContext("a1"), { wrapper });

    act(() => {
      result.current.save(["x", "a"]);
      result.current.save(["x", "a", "b"]);
      result.current.save(["x", "a", "b", "c"]);
    });
    // the list is shown at once, before any answer
    expect(qc.getQueryData(KEY)).toEqual({ paths: ["x", "a", "b", "c"] });

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(lastPut(puts).url).toMatch(/\/agents\/a1\/context$/);
    expect(lastPut(puts).paths).toEqual(["x", "a"]);
    expect(result.current.isPending).toBe(true);

    await lastPut(puts).ok();
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(lastPut(puts).paths).toEqual(["x", "a", "b", "c"]);
    // the first answer does not overwrite the newer list the user is looking at
    expect(qc.getQueryData(KEY)).toEqual({ paths: ["x", "a", "b", "c"] });

    await lastPut(puts).ok();
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(qc.getQueryData(KEY)).toEqual({ paths: ["x", "a", "b", "c"] });
    expect(putCount(fn)).toBe(2);
  });

  it("sends nothing more after the last save, and a later save starts a new PUT", async () => {
    const { qc, wrapper } = setup();
    const { fn, puts } = holdPuts();
    qc.setQueryData(KEY, { paths: [] });
    const { result } = renderHook(() => useSetAgentContext("a1"), { wrapper });

    act(() => result.current.save(["a"]));
    await waitFor(() => expect(puts).toHaveLength(1));
    await lastPut(puts).ok();
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(putCount(fn)).toBe(1);

    act(() => result.current.save(["a", "b"]));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(lastPut(puts).paths).toEqual(["a", "b"]);
    await lastPut(puts).ok();
    await waitFor(() => expect(qc.getQueryData(KEY)).toEqual({ paths: ["a", "b"] }));
  });

  it("a failing PUT with a waiting list restores the list read from the server and sends no further PUT", async () => {
    const { qc, wrapper } = setup();
    const { fn, puts } = holdPuts({ "/agents/a1/context": { paths: ["x"] } });
    const { result } = renderHook(
      () => ({ owner: useAgentContext("a1"), set: useSetAgentContext("a1") }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.owner.data).toEqual({ paths: ["x"] }));

    act(() => {
      result.current.set.save(["x", "a"]);
      result.current.set.save(["x", "a", "b"]);
    });
    expect(qc.getQueryData(KEY)).toEqual({ paths: ["x", "a", "b"] });
    await waitFor(() => expect(puts).toHaveLength(1));

    await lastPut(puts).fail();
    await waitFor(() => expect(qc.getQueryData(KEY)).toEqual({ paths: ["x"] }));
    await act(async () => {});
    expect(putCount(fn)).toBe(1);
    expect(result.current.set.isPending).toBe(false);

    // the queue is clear: the next save is sent at once
    act(() => result.current.set.save(["x", "c"]));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(lastPut(puts).paths).toEqual(["x", "c"]);
    await lastPut(puts).ok();
    await waitFor(() => expect(qc.getQueryData(KEY)).toEqual({ paths: ["x", "c"] }));
  });

  it("a failure after a queued save succeeded restores that last confirmed list, not the one from the GET", async () => {
    const { qc, wrapper } = setup();
    const { fn, puts } = holdPuts();
    qc.setQueryData(KEY, { paths: ["x"] });
    const { result } = renderHook(() => useSetAgentContext("a1"), { wrapper });

    act(() => {
      result.current.save(["x", "a"]);
      result.current.save(["x", "a", "b"]);
    });
    await waitFor(() => expect(puts).toHaveLength(1));
    await lastPut(puts).ok(); // confirms ["x", "a"]
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(lastPut(puts).paths).toEqual(["x", "a", "b"]);

    act(() => result.current.save(["x", "a", "b", "c"])); // waits behind the second PUT
    expect(qc.getQueryData(KEY)).toEqual({ paths: ["x", "a", "b", "c"] });

    await lastPut(puts).fail();
    await waitFor(() => expect(qc.getQueryData(KEY)).toEqual({ paths: ["x", "a"] }));
    await act(async () => {});
    expect(putCount(fn)).toBe(2);
  });

  it("a failure with no confirmed list known invalidates the owner's query instead of writing a list", async () => {
    const { qc, invalidate, wrapper } = setup();
    const { puts } = holdPuts();
    const { result } = renderHook(() => useSetAgentContext("a1"), { wrapper });

    act(() => result.current.save(["a"]));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(callsWith(invalidate, KEY)).toBe(0);

    await lastPut(puts).fail();
    await waitFor(() => expect(callsWith(invalidate, KEY)).toBe(1));
    expect(callsWith(invalidate, contextKeys.files)).toBe(0);
  });

  it("each successful PUT invalidates the context-file queries; a failed one does not", async () => {
    const { qc, invalidate, wrapper } = setup();
    const { puts } = holdPuts();
    qc.setQueryData(KEY, { paths: [] });
    const { result } = renderHook(() => useSetAgentContext("a1"), { wrapper });

    act(() => {
      result.current.save(["a"]);
      result.current.save(["a", "b"]);
    });
    await waitFor(() => expect(puts).toHaveLength(1));
    await lastPut(puts).ok();
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(callsWith(invalidate, ["context-file"])).toBe(1);
    await lastPut(puts).ok();
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(callsWith(invalidate, ["context-file"])).toBe(2);

    act(() => result.current.save(["z"]));
    await waitFor(() => expect(puts).toHaveLength(3));
    await lastPut(puts).fail();
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(callsWith(invalidate, ["context-file"])).toBe(2);
  });
});

describe("useSetSkillContext", () => {
  it("saves to the skill's endpoint and writes the answer under the skill key", async () => {
    const { qc, wrapper } = setup();
    const { puts } = holdPuts();
    qc.setQueryData(contextKeys.skill("s1"), { paths: [] });
    const { result } = renderHook(() => useSetSkillContext("s1"), { wrapper });

    act(() => result.current.save(["docs/a.md"]));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(lastPut(puts).url).toMatch(/\/skills\/s1\/context$/);
    expect(lastPut(puts).paths).toEqual(["docs/a.md"]);

    await lastPut(puts).ok(["docs/a.md"]);
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(qc.getQueryData(["skill-context", "s1"])).toEqual({ paths: ["docs/a.md"] });
    expect(qc.getQueryData(["agent-context", "s1"])).toBeUndefined();
  });
});
