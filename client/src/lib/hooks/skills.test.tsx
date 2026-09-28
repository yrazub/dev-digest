import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentSkill } from "@devdigest/shared";
import { useCreateSkill, useImportSkillFile } from "./skills";
import { applyLinkOrder, useSetAgentSkills } from "./agents";

afterEach(() => vi.unstubAllGlobals());

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

const skill = (id: string, linked: boolean, order: number | null): AgentSkill => ({
  id,
  name: id,
  description: "d",
  type: "custom",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  evidence_files: null,
  agent_count: 0,
  created_at: "2026-09-28T00:00:00.000Z",
  linked,
  order,
});

describe("skills hooks", () => {
  it("create sends JSON", async () => {
    const fetch = mockFetch({ id: "s1" });
    const { wrapper } = setup();
    const { result } = renderHook(() => useCreateSkill(), { wrapper });
    result.current.mutate({ name: "edge-cases", description: "d", type: "custom", body: "b" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/skills$/);
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
  });

  it("file import uploads multipart without a JSON content-type", async () => {
    const fetch = mockFetch({ name: "x", source: "imported_file", ignored_files: [] });
    const { wrapper } = setup();
    const { result } = renderHook(() => useImportSkillFile(), { wrapper });
    result.current.mutate(new File(["# rule"], "rule.md"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/skills\/import\/file$/);
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect((init.headers as Record<string, string>)["content-type"]).toBeUndefined();
  });
});

describe("agent skills", () => {
  it("applyLinkOrder puts linked ids first in the given order", () => {
    const list = [skill("a", true, 0), skill("b", false, null), skill("c", false, null)];
    const next = applyLinkOrder(list, ["c", "a"]);
    expect(next.map((s) => [s.id, s.linked, s.order])).toEqual([
      ["c", true, 0],
      ["a", true, 1],
      ["b", false, null],
    ]);
  });

  it("set is optimistic and rolls back when the server refuses", async () => {
    const { qc, wrapper } = setup();
    const before = [skill("a", true, 0), skill("b", false, null)];
    qc.setQueryData(["agent-skills", "ag1"], before);

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetch = vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify({ error: { code: "validation_error", message: "no" } }), { status: 422 });
    });
    vi.stubGlobal("fetch", fetch);

    const { result } = renderHook(() => useSetAgentSkills("ag1"), { wrapper });
    result.current.mutate(["b", "a"]);

    await waitFor(() =>
      expect(qc.getQueryData<AgentSkill[]>(["agent-skills", "ag1"])!.map((s) => s.id)).toEqual(["b", "a"]),
    );
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ skill_ids: ["b", "a"] });

    release();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(["agent-skills", "ag1"])).toEqual(before);
  });
});
