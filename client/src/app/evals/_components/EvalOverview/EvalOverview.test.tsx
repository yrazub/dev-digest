import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAgentOverview, EvalOverview as EvalOverviewData, EvalSuiteRun } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";

const router = { push: vi.fn(), replace: vi.fn() };
const refetch = vi.fn();
let state: { data?: EvalOverviewData; isLoading: boolean; isError: boolean };

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/hooks/evals", async () => ({
  ...(await vi.importActual<object>("@/lib/hooks/evals")),
  useEvalOverview: () => ({ ...state, refetch }),
}));

import { EvalOverview } from "./EvalOverview";

const CONFIG = { agent_version: 3, system_prompt: "p", provider: "openai", model: "gpt-x", strategy: "single-pass", skills: [] };
const at = (h: number, m = 0) => new Date(2026, 9, 30, h, m).toISOString();

function run(id: string, agent: { id: string; name: string }, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    agent_id: agent.id,
    agent_name: agent.name,
    status: "done",
    config: CONFIG,
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    cases_total: 4,
    cases_done: 4,
    cases_passed: 4,
    cases_errored: 0,
    cost_usd: null,
    started_at: at(10),
    finished_at: at(11),
    error: null,
    ...over,
  } as EvalSuiteRun;
}

const SEC = { id: "a-sec", name: "Security Reviewer" };
const PERF = { id: "a-perf", name: "Performance Reviewer" };
const OFF = { id: "a-off", name: "Legacy Reviewer" };

function agent(a: { id: string; name: string }, over: Partial<EvalAgentOverview> = {}): EvalAgentOverview {
  return {
    agent_id: a.id,
    agent_name: a.name,
    provider: "openai",
    model: "gpt-x",
    enabled: true,
    cases_total: 4,
    runs_total: 0,
    running: false,
    latest: null,
    recall_trend: [],
    ...over,
  } as EvalAgentOverview;
}

const SEC_LATEST = run("r-sec", SEC, { recall: 0.75, precision: 0.5, citation_accuracy: 0.25, cases_passed: 3, started_at: at(10, 5) });

function renderOverview() {
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalOverview />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  router.push.mockClear();
  refetch.mockClear();
  state = { data: { agents: [], recent_runs: [] }, isLoading: false, isError: false };
});
afterEach(cleanup);

describe("EvalOverview agents", () => {
  it("shows an agent's latest done metrics, last-run line and recall sparkline", () => {
    state.data = {
      agents: [agent(SEC, { runs_total: 2, latest: SEC_LATEST, recall_trend: [0.5, 0.75] })],
      recent_runs: [],
    };
    renderOverview();
    const row = screen.getByRole("button", { name: /Security Reviewer/ });
    expect(within(row).getByText("gpt-x")).toBeInTheDocument();
    expect(within(row).getByText("Last run v3 · 2026-10-30 10:05 · 3/4 pass")).toBeInTheDocument();
    expect(within(row).getByText("75%")).toBeInTheDocument();
    expect(within(row).getByText("50%")).toBeInTheDocument();
    expect(within(row).getByText("25%")).toBeInTheDocument();
    expect(within(row).getByTestId("recall-sparkline")).toBeInTheDocument();
  });

  it("an agent with no done run says so, shows em-dashes and no sparkline", () => {
    state.data = { agents: [agent(PERF)], recent_runs: [] };
    renderOverview();
    const row = screen.getByRole("button", { name: /Performance Reviewer/ });
    expect(within(row).getByText("No eval runs yet")).toBeInTheDocument();
    expect(within(row).getAllByText("—")).toHaveLength(3);
    expect(within(row).queryByTestId("recall-sparkline")).toBeNull();
  });

  it("lists a disabled agent like any other", () => {
    state.data = { agents: [agent(SEC, { latest: SEC_LATEST }), agent(OFF, { enabled: false })], recent_runs: [] };
    renderOverview();
    expect(screen.getByRole("button", { name: /Security Reviewer/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Legacy Reviewer/ })).toBeInTheDocument();
  });

  it("with no agents shows the empty state and a link to /agents", () => {
    renderOverview();
    expect(screen.getByText("No agents yet. Create an agent to start evaluating it.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Agents" })).toHaveAttribute("href", "/agents");
  });
});

describe("EvalOverview recent runs", () => {
  const recent = [
    run("r1", SEC, { started_at: at(9) }),
    run("r2", PERF, { started_at: at(8), recall: 0.5, precision: 0.25, citation_accuracy: 0, cases_passed: 2 }),
    run("r3", SEC, { status: "running", cases_done: 1, cases_passed: 0, recall: null, precision: null, citation_accuracy: null, started_at: at(7) }),
    run("r4", PERF, { status: "failed", cases_passed: 0, recall: null, precision: null, citation_accuracy: null, started_at: at(6) }),
    run("r5", OFF, { started_at: at(5) }),
    run("r6", OFF, { started_at: at(4) }),
  ];

  it("lists the six runs with agent names, a running progress and a failed row", () => {
    state.data = { agents: [], recent_runs: recent };
    renderOverview();
    expect(screen.getByText("Recent eval runs · all agents")).toBeInTheDocument();
    const rows = screen.getAllByRole("button");
    expect(rows).toHaveLength(6);
    expect(within(rows[0]!).getByText("Security Reviewer")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("2026-10-30 09:00")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("v3")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("4/4")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Performance Reviewer")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("50%")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("25%")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("0%")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Running… 1/4")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("failed")).toBeInTheDocument();
    expect(within(rows[3]!).queryByText(/%/)).toBeNull();
    expect(within(rows[4]!).getByText("Legacy Reviewer")).toBeInTheDocument();
  });

  it("clicking an agent row and a recent row opens /evals/<agentId>", async () => {
    const user = userEvent.setup();
    state.data = {
      agents: [agent(SEC, { latest: SEC_LATEST })],
      recent_runs: [run("r-perf", PERF)],
    };
    renderOverview();
    await user.click(screen.getByRole("button", { name: /Security Reviewer/ }));
    expect(router.push).toHaveBeenLastCalledWith("/evals/a-sec");
    await user.click(screen.getByRole("button", { name: /Performance Reviewer/ }));
    expect(router.push).toHaveBeenLastCalledWith("/evals/a-perf");
    expect(router.push).toHaveBeenCalledTimes(2);
  });
});

describe("EvalOverview states", () => {
  it("shows no rows while loading", () => {
    state = { data: undefined, isLoading: true, isError: false };
    renderOverview();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Recent eval runs · all agents")).toBeNull();
  });

  it("an error shows the message and Retry refetches", async () => {
    const user = userEvent.setup();
    state = { data: undefined, isLoading: false, isError: true };
    renderOverview();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the eval overview.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
