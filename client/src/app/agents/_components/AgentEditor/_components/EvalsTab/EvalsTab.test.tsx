import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type {
  EvalCaseOutcome,
  EvalCaseRecord,
  EvalCaseResult,
  EvalSuiteRun,
  EvalSuiteRunDetail,
} from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../messages/en/eval.json";

// The hooks module is the seam. Every hook result is one stable object, reset in beforeEach.
const mocks = vi.hoisted(() => {
  type Mut = {
    mutate: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
    isPending: boolean;
    isError: boolean;
    error: Error | null;
  };
  return {
    cases: { data: undefined as { cases: unknown[] } | undefined, isError: false },
    runs: { data: undefined as { runs: unknown[]; total: number } | undefined },
    runQueries: {} as Record<string, { data: unknown }>,
    emptyRun: { data: undefined },
    limits: [] as number[],
    runIds: [] as Array<string | undefined>,
    del: {} as Mut,
    start: {} as Mut,
  };
});

vi.mock("@/lib/hooks/evals", () => ({
  useAgentEvalCases: () => mocks.cases,
  useAgentEvalRuns: (_agentId: string, limit: number) => {
    mocks.limits.push(limit);
    return mocks.runs;
  },
  useEvalRun: (runId: string | undefined) => {
    mocks.runIds.push(runId);
    return (runId && mocks.runQueries[runId]) || mocks.emptyRun;
  },
  useDeleteEvalCase: () => mocks.del,
  useStartEvalRun: () => mocks.start,
}));

import { EvalsTab } from "./EvalsTab";

const FIND = { severity: "CRITICAL", category: "security" } as const;

function evalCase(id: string, over: Partial<EvalCaseRecord> = {}): EvalCaseRecord {
  return {
    id,
    owner_kind: "agent",
    owner_id: "ag1",
    name: `case-${id}`,
    input_diff: `--- a/src/${id}.ts\n+++ b/src/${id}.ts\n@@ -1 +1 @@\n+const x = 1;`,
    input_files: null,
    input_meta: {},
    expected_output: { kind: "must_find", file: `src/${id}.ts`, start_line: 10, end_line: 14, title: `Title ${id}`, ...FIND },
    source_finding_id: null,
    created_at: "2026-10-30T10:00:00.000Z",
    ...over,
  } as EvalCaseRecord;
}

function run(id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    status: "done",
    config: { agent_version: 3, system_prompt: "p", provider: "openai", model: "m", strategy: "single-pass", skills: [] },
    recall: 0.8,
    precision: 0.6,
    citation_accuracy: 1,
    cases_total: 4,
    cases_done: 4,
    cases_passed: 2,
    cases_errored: 0,
    cost_usd: 0.004,
    started_at: new Date(2026, 9, 30, 10, 0).toISOString(),
    finished_at: null,
    error: null,
    ...over,
  };
}

function detail(r: EvalSuiteRun, outcomes: Record<string, EvalCaseOutcome>): EvalSuiteRunDetail {
  const results = Object.entries(outcomes).map(
    ([caseId, outcome]) =>
      ({
        id: `res-${caseId}`,
        suite_run_id: r.id,
        case_id: caseId,
        case_name: `case-${caseId}`,
        kind: "must_find",
        expectation: evalCase(caseId).expected_output,
        outcome,
        actual_output: { findings: [], dropped: 0 },
        error: null,
      }) as unknown as EvalCaseResult,
  );
  return { ...r, results };
}

function setCases(cases: EvalCaseRecord[]) {
  mocks.cases.data = { cases };
}
function setRuns(runs: EvalSuiteRun[], total = runs.length) {
  mocks.runs.data = { runs, total };
}

beforeEach(() => {
  mocks.cases.data = undefined;
  mocks.cases.isError = false;
  mocks.runs.data = { runs: [], total: 0 };
  mocks.runQueries = {};
  mocks.limits.length = 0;
  mocks.runIds.length = 0;
  mocks.del = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null };
  mocks.start = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null };
});
afterEach(cleanup);

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalsTab agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest("li") as HTMLElement;
}

describe("EvalsTab case list", () => {
  it("shows every case with its kind, location and outcome in the latest done run, and counts the passing ones", () => {
    const latest = run("r1");
    setCases([
      evalCase("c1"),
      evalCase("c2", {
        expected_output: { kind: "must_not_flag", file: "src/c2.ts", start_line: 7, end_line: 7, title: "Not a bug", ...FIND },
      } as Partial<EvalCaseRecord>),
      evalCase("c3"),
      evalCase("c4"),
    ]);
    setRuns([latest]);
    mocks.runQueries.r1 = { data: detail(latest, { c1: "pass", c2: "fail", c3: "errored" }) };
    renderTab();

    expect(mocks.runIds).toContain("r1");

    const c1 = within(rowOf("case-c1"));
    expect(c1.getByRole("img", { name: "pass" })).toBeInTheDocument();
    expect(c1.getByText("must find")).toBeInTheDocument();
    expect(c1.getByText("src/c1.ts:10-14 — Title c1")).toBeInTheDocument();

    const c2 = within(rowOf("case-c2"));
    expect(c2.getByRole("img", { name: "fail" })).toBeInTheDocument();
    expect(c2.getByText("must not flag")).toBeInTheDocument();
    expect(c2.getByText("src/c2.ts:7 — Not a bug")).toBeInTheDocument();

    expect(within(rowOf("case-c3")).getByRole("img", { name: "errored" })).toBeInTheDocument();
    expect(within(rowOf("case-c4")).getByRole("img", { name: "never run" })).toBeInTheDocument();

    expect(screen.getByText("1 / 4 passing")).toBeInTheDocument();
    expect(screen.getByText("4 cases")).toBeInTheDocument();
  });

  it("shows the empty state with the run button disabled and no passing badge", () => {
    setCases([]);
    renderTab();
    expect(screen.getByText(/No eval cases yet\. Accept or dismiss a finding/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run eval (0)" })).toBeDisabled();
    expect(screen.queryByText(/passing/)).not.toBeInTheDocument();
    expect(screen.getByText("0 cases")).toBeInTheDocument();
  });

  it("shows a loading line while the cases load and an error line when they cannot be read", () => {
    const { unmount } = renderTab();
    expect(screen.getByText("Loading cases…")).toBeInTheDocument();
    unmount();

    mocks.cases.isError = true;
    renderTab();
    expect(screen.getByText("Could not load eval cases.")).toBeInTheDocument();
    expect(screen.queryByText("Loading cases…")).not.toBeInTheDocument();
  });

  it("expands a case to show its diff fragment as text, never as markup", async () => {
    const user = userEvent.setup();
    setCases([evalCase("c1", { input_diff: "+<b>bold</b> fragment" })]);
    renderTab();

    const toggle = screen.getByRole("button", { name: "Show diff of case case-c1" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("+<b>bold</b> fragment")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("+<b>bold</b> fragment")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();

    await user.click(toggle);
    expect(screen.queryByText("+<b>bold</b> fragment")).not.toBeInTheDocument();
  });

  it("links to the full dashboard of the agent", () => {
    setCases([evalCase("c1")]);
    renderTab();
    expect(screen.getByRole("link", { name: "View full dashboard →" })).toHaveAttribute("href", "/evals/ag1");
  });
});

describe("EvalsTab delete", () => {
  it("asks for confirmation, then deletes the case and drops its row", async () => {
    const user = userEvent.setup();
    setCases([evalCase("c1"), evalCase("c2")]);
    // The server removes the case; the list refetches and the modal closes on success.
    mocks.del.mutate.mockImplementation((id: string, opts: { onSuccess: () => void }) => {
      setCases([evalCase("c2")]);
      opts.onSuccess();
    });
    renderTab();

    await user.click(screen.getByRole("button", { name: "Delete case case-c1" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Delete eval case")).toBeInTheDocument();
    expect(within(dialog).getByText("Delete eval case case-c1? Past runs keep their metrics.")).toBeInTheDocument();
    expect(mocks.del.mutate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(mocks.del.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.del.mutate.mock.calls[0]?.[0]).toBe("c1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("case-c1")).not.toBeInTheDocument();
    expect(screen.getByText("case-c2")).toBeInTheDocument();
  });

  it("cancel closes the confirm and deletes nothing", async () => {
    const user = userEvent.setup();
    setCases([evalCase("c1")]);
    renderTab();
    await user.click(screen.getByRole("button", { name: "Delete case case-c1" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.del.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("case-c1")).toBeInTheDocument();
  });

  it("keeps the confirm open and shows the failure message when the delete fails", async () => {
    const user = userEvent.setup();
    setCases([evalCase("c1")]);
    mocks.del.isError = true;
    mocks.del.error = new Error("Case is gone");
    renderTab();
    await user.click(screen.getByRole("button", { name: "Delete case case-c1" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Case is gone");
  });

  it("disables Delete while a run is running, and the control keeps its label", async () => {
    const user = userEvent.setup();
    setCases([evalCase("c1")]);
    setRuns([run("r2", { status: "running", cases_done: 2, cases_total: 5 })]);
    renderTab();

    const del = screen.getByRole("button", { name: "Delete case case-c1" });
    expect(del).toBeDisabled();
    await user.click(del);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("EvalsTab run button", () => {
  it("starts one run per press of Run eval (N)", async () => {
    const user = userEvent.setup();
    setCases([evalCase("c1"), evalCase("c2")]);
    renderTab();
    await user.click(screen.getByRole("button", { name: "Run eval (2)" }));
    expect(mocks.start.mutate).toHaveBeenCalledTimes(1);
  });

  it("shows Running… k/N disabled while a run is running", async () => {
    const user = userEvent.setup();
    setCases([evalCase("c1")]);
    setRuns([run("r2", { status: "running", cases_done: 2, cases_total: 5 })]);
    renderTab();
    const button = screen.getByRole("button", { name: "Running… 2/5" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(mocks.start.mutate).not.toHaveBeenCalled();
  });

  it("offers the Settings link when the provider key is missing", () => {
    setCases([evalCase("c1")]);
    mocks.start.isError = true;
    mocks.start.error = new ApiError("No API key for openai. Add it in Settings.", 400, "eval_unavailable");
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent("No API key for openai. Add it in Settings.");
    expect(screen.getByRole("link", { name: "Add an API key in Settings" })).toHaveAttribute(
      "href",
      "/settings/api-keys",
    );
  });

  it("shows any other start error as its message", () => {
    setCases([evalCase("c1")]);
    mocks.start.isError = true;
    mocks.start.error = new ApiError("An eval run of this agent is already running", 409, "conflict");
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent("An eval run of this agent is already running");
    expect(screen.queryByRole("link", { name: "Add an API key in Settings" })).not.toBeInTheDocument();
  });
});

describe("EvalsTab metric strip", () => {
  const tile = (label: string) => within(screen.getByText(label).parentElement as HTMLElement);

  it("shows the latest done run's metrics with a delta against the previous done run", () => {
    setCases([evalCase("c1")]);
    setRuns([
      run("r1", { recall: 0.8, precision: 0.6, citation_accuracy: 1, cases_passed: 3, cases_total: 4 }),
      run("r0", { recall: 0.5, precision: 0.6, citation_accuracy: 0.9 }),
    ]);
    renderTab();

    expect(tile("RECALL").getByText("80%")).toBeInTheDocument();
    expect(tile("RECALL").getByText("▲ +30pt")).toBeInTheDocument();
    expect(tile("PRECISION").getByText("60%")).toBeInTheDocument();
    expect(tile("PRECISION").getByText("±0pt")).toBeInTheDocument();
    expect(tile("CITATION ACCURACY").getByText("100%")).toBeInTheDocument();
    expect(tile("CITATION ACCURACY").getByText("▲ +10pt")).toBeInTheDocument();
    expect(tile("Cases passed").getByText("3/4")).toBeInTheDocument();
  });

  it("shows a drop with its minus sign", () => {
    setCases([evalCase("c1")]);
    setRuns([run("r1", { recall: 0.4 }), run("r0", { recall: 0.5 })]);
    renderTab();
    expect(tile("RECALL").getByText("▼ −10pt")).toBeInTheDocument();
  });

  it("shows no delta with a single done run", () => {
    setCases([evalCase("c1")]);
    setRuns([run("r1")]);
    renderTab();
    expect(tile("RECALL").getByText("80%")).toBeInTheDocument();
    for (const label of ["RECALL", "PRECISION", "CITATION ACCURACY"]) {
      expect(tile(label).queryByText(/pt$/)).not.toBeInTheDocument();
    }
  });

  it("shows dashes when there is no done run", () => {
    setCases([evalCase("c1")]);
    setRuns([run("r1", { status: "running", recall: null, precision: null, citation_accuracy: null })]);
    renderTab();
    expect(tile("RECALL").getByText("—")).toBeInTheDocument();
    expect(tile("Cases passed").getByText("—")).toBeInTheDocument();
  });
});

describe("EvalsTab runs", () => {
  it("lists the runs, shows 'No runs' without any, and loads 20 more with Show more", async () => {
    const user = userEvent.setup();
    setCases([evalCase("c1")]);
    renderTab();
    expect(screen.getByText(/No runs yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    cleanup();

    mocks.limits.length = 0;
    setRuns([run("r1"), run("r2", { started_at: new Date(2026, 9, 29, 9, 30).toISOString() })], 45);
    renderTab();
    expect(screen.getByText("2026-10-30 10:00")).toBeInTheDocument();
    expect(screen.getByText("2026-10-29 09:30")).toBeInTheDocument();
    expect(mocks.limits.at(-1)).toBe(20);

    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(mocks.limits.at(-1)).toBe(40);
  });

  it("hides Show more once every run is loaded", () => {
    setCases([evalCase("c1")]);
    setRuns([run("r1")], 1);
    renderTab();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("shows running, errored and failed runs on their rows", () => {
    setCases([evalCase("c1")]);
    setRuns([
      run("r3", { status: "running", cases_done: 1, cases_total: 4, recall: null, precision: null, citation_accuracy: null }),
      run("r2", { status: "failed", error: "All 4 cases failed: boom", recall: null, precision: null, citation_accuracy: null }),
      run("r1", { cases_errored: 1 }),
    ]);
    renderTab();
    expect(screen.getAllByText("Running… 1/4").length).toBeGreaterThan(0);
    expect(screen.getByText("All 4 cases failed: boom")).toBeInTheDocument();
    expect(screen.getByText("1 of 4 cases errored")).toBeInTheDocument();
  });

  it("opens the run drawer from a row and closes it on Esc", async () => {
    const user = userEvent.setup();
    const r1 = run("r1");
    setCases([evalCase("c1")]);
    setRuns([r1]);
    mocks.runQueries.r1 = { data: detail(r1, { c1: "pass" }) };
    renderTab();

    expect(screen.queryByRole("dialog", { name: "Run details" })).not.toBeInTheDocument();
    await user.click(screen.getByText("2026-10-30 10:00"));
    expect(screen.getByRole("dialog", { name: "Run details" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Run details" })).not.toBeInTheDocument();
  });
});
