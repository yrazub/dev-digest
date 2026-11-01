import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSuiteRun } from "@devdigest/shared";
import messages from "../../../../../../messages/en/eval.json";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const start = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as Error | null,
}));
const refetch = vi.fn();
let agentsData: Array<{ id: string; name: string; model: string }>;
let casesData: { cases: unknown[] } | undefined;
let runsState: { data?: { runs: EvalSuiteRun[]; total: number }; isLoading: boolean; isError: boolean };
const useRunsSpy = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: agentsData }) }));
vi.mock("@/lib/hooks/evals", async () => ({
  ...(await vi.importActual<object>("@/lib/hooks/evals")),
  useAgentEvalCases: () => ({ data: casesData }),
  useAgentEvalRuns: (agentId: string, limit: number) => {
    useRunsSpy(agentId, limit);
    return { ...runsState, refetch };
  },
  useStartEvalRun: () => start,
}));

import { AgentEvalView } from "./AgentEvalView";

const CONFIG = { agent_version: 1, system_prompt: "p", provider: "openai", model: "gpt-x", strategy: "single-pass", skills: [] };
// Built in local time so the checkbox names do not depend on TZ.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();

function run(id: string, version: number, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    agent_id: "a-sec",
    agent_name: "Security Reviewer",
    status: "done",
    config: { ...CONFIG, agent_version: version },
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    cases_total: 2,
    cases_done: 2,
    cases_passed: 2,
    cases_errored: 0,
    cost_usd: 0.004,
    started_at: at(30, 10),
    finished_at: at(30, 11),
    error: null,
    ...over,
  } as EvalSuiteRun;
}

function setRuns(runs: EvalSuiteRun[], total = runs.length) {
  runsState = { data: { runs, total }, isLoading: false, isError: false };
}

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <AgentEvalView agentId="a-sec" />
    </NextIntlClientProvider>,
  );
}

/** The metric card with this label: label span -> head row -> card. */
const card = (label: string) => screen.getByText(label).parentElement!.parentElement!;

beforeEach(() => {
  router.push.mockClear();
  start.mutate.mockClear();
  refetch.mockClear();
  useRunsSpy.mockClear();
  start.isPending = false;
  start.isError = false;
  start.error = null;
  agentsData = [
    { id: "a-sec", name: "Security Reviewer", model: "gpt-x" },
    { id: "a-perf", name: "Performance Reviewer", model: "gpt-y" },
  ];
  casesData = { cases: [{}, {}] };
  setRuns([]);
});
afterEach(cleanup);

describe("AgentEvalView header", () => {
  it("shows the agent name, model chip, subtitle and the back link", () => {
    setRuns([run("r2", 2), run("r1", 1)]);
    renderView();
    expect(screen.getByRole("heading", { level: 1, name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("gpt-x")).toBeInTheDocument();
    expect(screen.getByText("Regression harness · 2 runs on 2 cases")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All agents" })).toHaveAttribute("href", "/evals");
  });

  it("puts the full name in a title so an ellipsised name stays readable", () => {
    const long = "A very long security reviewer agent name that will not fit the header line";
    agentsData = [{ id: "a-sec", name: long, model: "gpt-x" }];
    renderView();
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("title", long);
  });

  it("falls back to the newest run's agent name while the agent list has not loaded", () => {
    agentsData = [];
    setRuns([run("r1", 1, { agent_name: "Fallback Name" })]);
    renderView();
    expect(screen.getByRole("heading", { level: 1, name: "Fallback Name" })).toBeInTheDocument();
  });

  it("the agent switcher navigates to the chosen agent's dashboard", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: /Switch agent/ }));
    await user.click(screen.getByRole("button", { name: /Performance Reviewer/ }));
    expect(router.push).toHaveBeenCalledWith("/evals/a-perf");
  });

  it("Run eval (N) starts a run", async () => {
    const user = userEvent.setup();
    setRuns([run("r1", 1)]);
    renderView();
    await user.click(screen.getByRole("button", { name: "Run eval (2)" }));
    expect(start.mutate).toHaveBeenCalledTimes(1);
  });

  it("shows Running… k/N, disabled, while a run is running", () => {
    setRuns([run("r2", 2, { status: "running", cases_done: 1, cases_total: 2, recall: null, precision: null, citation_accuracy: null }), run("r1", 1)]);
    renderView();
    // the running row in the table carries the same text; the button is the one that is a <button> named so
    const buttons = screen.getAllByRole("button", { name: /Running… 1\/2/ });
    const header = buttons.find((b) => b.tagName === "BUTTON")!;
    expect(header).toBeDisabled();
  });
});

describe("AgentEvalView metric cards", () => {
  it("shows the latest done run with signed deltas against the previous done run", () => {
    setRuns([
      run("r2", 2, { recall: 1, precision: 0.84, citation_accuracy: 0.5 }),
      run("r1", 1, { recall: 0.5, precision: 0.92, citation_accuracy: 0.5, started_at: at(29, 10) }),
    ]);
    renderView();
    const recall = card("RECALL");
    expect(within(recall).getByText("100")).toBeInTheDocument();
    expect(within(recall).getByText("%")).toBeInTheDocument();
    expect(within(recall).getByText("▲ +50pt")).toBeInTheDocument();
    const precision = card("PRECISION");
    expect(within(precision).getByText("84")).toBeInTheDocument();
    expect(within(precision).getByText("▼ −8pt")).toBeInTheDocument();
    const citation = card("CITATION ACCURACY");
    expect(within(citation).getByText("50")).toBeInTheDocument();
    expect(within(citation).getByText("±0pt")).toBeInTheDocument();
  });

  it("null metrics render an em-dash and no delta", () => {
    setRuns([
      run("r2", 2, { recall: null, precision: null, citation_accuracy: null }),
      run("r1", 1, { started_at: at(29, 10) }),
    ]);
    renderView();
    for (const label of ["RECALL", "PRECISION", "CITATION ACCURACY"]) {
      const c = card(label);
      expect(within(c).getByText("—")).toBeInTheDocument();
      expect(within(c).queryByText(/pt$/)).toBeNull();
    }
  });

  it("a single done run gives the value but no delta", () => {
    setRuns([run("r1", 1, { recall: 0.75 })]);
    renderView();
    expect(within(card("RECALL")).getByText("75")).toBeInTheDocument();
    expect(screen.queryByText(/pt$/)).toBeNull();
  });

  it("with no done run every card shows an em-dash", () => {
    setRuns([run("r1", 1, { status: "failed", recall: null, precision: null, citation_accuracy: null, error: "boom" })]);
    renderView();
    expect(within(card("RECALL")).getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/pt$/)).toBeNull();
  });
});

describe("AgentEvalView regression banner", () => {
  it("is shown when precision dipped, naming the points and the latest version", () => {
    setRuns([run("r2", 2, { precision: 0.5 }), run("r1", 1, { precision: 1, started_at: at(29, 10) })]);
    renderView();
    expect(screen.getByText("Precision dipped 50 pts on v2")).toBeInTheDocument();
  });

  it("is hidden when precision rose or stayed", () => {
    setRuns([run("r2", 2, { precision: 1 }), run("r1", 1, { precision: 0.5, started_at: at(29, 10) })]);
    renderView();
    expect(screen.queryByText(/Precision dipped/)).toBeNull();
  });
});

describe("AgentEvalView trend card", () => {
  it("shows the Metric trend title", () => {
    setRuns([run("r1", 1)]);
    renderView();
    expect(screen.getByText("Metric trend")).toBeInTheDocument();
  });
});

describe("AgentEvalView runs table selection", () => {
  const three = () => [
    run("r3", 3, { started_at: at(30, 12) }),
    run("r2", 2, { started_at: at(30, 11) }),
    run("r1", 1, { started_at: at(30, 10) }),
  ];

  it("names each checkbox by local time and version", () => {
    setRuns(three());
    renderView();
    expect(screen.getByRole("checkbox", { name: "2026-10-30 10:00 · v1" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "2026-10-30 12:00 · v3" })).toBeInTheDocument();
  });

  it("disables the checkboxes of failed and running runs", () => {
    setRuns([
      run("r3", 3, { status: "running", cases_done: 0, recall: null, precision: null, citation_accuracy: null, started_at: at(30, 12) }),
      run("r2", 2, { status: "failed", recall: null, precision: null, citation_accuracy: null, error: "boom", started_at: at(30, 11) }),
      run("r1", 1, { started_at: at(30, 10) }),
    ]);
    renderView();
    expect(screen.getByRole("checkbox", { name: "2026-10-30 12:00 · v3" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "2026-10-30 11:00 · v2" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "2026-10-30 10:00 · v1" })).toBeEnabled();
  });

  it("a third pick drops the earliest-selected run", async () => {
    const user = userEvent.setup();
    setRuns(three());
    renderView();
    const v1 = screen.getByRole("checkbox", { name: "2026-10-30 10:00 · v1" });
    const v2 = screen.getByRole("checkbox", { name: "2026-10-30 11:00 · v2" });
    const v3 = screen.getByRole("checkbox", { name: "2026-10-30 12:00 · v3" });
    expect(screen.getByText("Select two runs to compare")).toBeInTheDocument();
    await user.click(v1);
    await user.click(v2);
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await user.click(v3);
    expect(v1).not.toBeChecked();
    expect(v2).toBeChecked();
    expect(v3).toBeChecked();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("toggling a selected checkbox clears it", async () => {
    const user = userEvent.setup();
    setRuns(three());
    renderView();
    const v1 = screen.getByRole("checkbox", { name: "2026-10-30 10:00 · v1" });
    await user.click(v1);
    expect(v1).toBeChecked();
    await user.click(v1);
    expect(v1).not.toBeChecked();
    expect(screen.getByText("Select two runs to compare")).toBeInTheDocument();
  });
});

describe("AgentEvalView Show more", () => {
  it("requests 20 runs first and 40 after Show more, and hides the button when all are loaded", async () => {
    const user = userEvent.setup();
    setRuns([run("r1", 1)], 25);
    renderView();
    expect(useRunsSpy).toHaveBeenLastCalledWith("a-sec", 20);
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(useRunsSpy).toHaveBeenLastCalledWith("a-sec", 40);
  });

  it("has no Show more when every run is loaded", () => {
    setRuns([run("r1", 1)], 1);
    renderView();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });
});

describe("AgentEvalView states", () => {
  it("with no runs says so", () => {
    renderView();
    expect(screen.getByText("No runs yet. Create an eval case and run it.")).toBeInTheDocument();
  });

  it("an error shows the message and Retry refetches", async () => {
    const user = userEvent.setup();
    runsState = { data: undefined, isLoading: false, isError: true };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load this agent's eval runs.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
