import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, ProjectContextList } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import contextMessages from "../../../../../messages/en/context.json";
import evalMessages from "../../../../../messages/en/eval.json";
import { ToastProvider } from "@/lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

// One stable object per hook result: the shared list reads function identities (`refetch`, `save`).
const refetch = vi.fn();
const save = vi.fn();
const agentContextCalls: string[] = [];
const agentContext = { data: { paths: [] as string[] }, isLoading: false, isError: false, refetch };
const contextFiles = { data: undefined as ProjectContextList | undefined, isLoading: false, isError: false, refetch };
const setAgentContext = { save };

vi.mock("@/lib/hooks/context", () => ({
  useAgentContext: (agentId: string) => {
    agentContextCalls.push(agentId);
    return agentContext;
  },
  useSetAgentContext: () => setAgentContext,
  useContextFiles: () => contextFiles,
  useContextFile: () => ({ data: undefined, isLoading: false, isError: false, refetch }),
}));
// The Evals tab reads these hooks; one stable object per result.
const evalCasesQuery = {
  data: {
    cases: [
      {
        id: "ec1",
        owner_kind: "agent",
        owner_id: "ag1",
        name: "stripe-key-leak",
        input_diff: "+x",
        input_files: null,
        input_meta: {},
        expected_output: {
          kind: "must_find",
          file: "src/pay.ts",
          start_line: 4,
          end_line: 4,
          title: "Hardcoded key",
          severity: "CRITICAL",
          category: "security",
        },
        source_finding_id: null,
        created_at: "2026-10-30T10:00:00.000Z",
      },
    ],
  },
  isError: false,
};
const evalRunsQuery = { data: { runs: [], total: 0 } };
const evalRunQuery = { data: undefined };
const evalMutation = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null };
vi.mock("@/lib/hooks/evals", () => ({
  useAgentEvalCases: () => evalCasesQuery,
  useAgentEvalRuns: () => evalRunsQuery,
  useEvalRun: () => evalRunQuery,
  useDeleteEvalCase: () => evalMutation,
  useStartEvalRun: () => evalMutation,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", activeRepo: { id: "r1", name: "x", full_name: "acme/x" } }),
}));

import { AgentEditor } from "./AgentEditor";

beforeEach(() => {
  save.mockClear();
  refetch.mockClear();
  agentContextCalls.length = 0;
  contextFiles.data = {
    state: "ready",
    roots: ["specs", "docs", "insights"],
    documents: [
      { path: "docs/a.md", kind: "docs", tokens: 100, status: "ok" },
      { path: "specs/b.md", kind: "specs", tokens: 200, status: "ok" },
    ],
    total_tokens: 300,
    capped: false,
    cap: 1000,
    soft_cap_tokens: 4000,
    run_cap_tokens: 16000,
  };
});
afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  skill_count: 0,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, context: contextMessages, eval: evalMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("lists the tabs Config, Skills, Context, Evals in that order", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(names.filter((n) => ["Config", "Skills", "Context", "Evals"].includes(n))).toEqual([
      "Config",
      "Skills",
      "Context",
      "Evals",
    ]);
  });

  it("calls onTab with context when the Context tab is clicked", async () => {
    const user = userEvent.setup();
    const onTab = vi.fn();
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={onTab} />);
    await user.click(screen.getByRole("button", { name: "Context" }));
    expect(onTab).toHaveBeenCalledTimes(1);
    expect(onTab).toHaveBeenCalledWith("context");
  });

  it("renders the agent's Context tab for tab=context, not the Config fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="context" onTab={() => {}} />);
    expect(screen.getByRole("heading", { name: "Project context" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach docs/a.md" })).toBeInTheDocument();
    expect(screen.queryByText("Configuration")).toBeNull();
    expect(agentContextCalls).toContain("ag1");
  });

  it("saves the agent's attached paths through the Context tab", async () => {
    const user = userEvent.setup();
    renderWithIntl(<AgentEditor agent={AGENT} tab="context" onTab={() => {}} />);
    await user.click(screen.getByRole("checkbox", { name: "Attach docs/a.md" }));
    expect(save).toHaveBeenCalledWith(["docs/a.md"]);
  });

  it("calls onTab with evals when the Evals tab is clicked", async () => {
    const user = userEvent.setup();
    const onTab = vi.fn();
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={onTab} />);
    await user.click(screen.getByRole("button", { name: "Evals" }));
    expect(onTab).toHaveBeenCalledTimes(1);
    expect(onTab).toHaveBeenCalledWith("evals");
  });

  it("renders the Evals tab for tab=evals, not the Config fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="evals" onTab={() => {}} />);
    expect(screen.getByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/evals/ag1");
    expect(screen.getByRole("button", { name: "Run eval (1)" })).toBeInTheDocument();
    expect(screen.queryByText("Configuration")).toBeNull();
    expect(screen.queryByText("Save agent")).toBeNull();
  });
});
