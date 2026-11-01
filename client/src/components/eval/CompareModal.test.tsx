import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseResult, EvalSuiteRunDetail } from "@devdigest/shared";
import messages from "../../../messages/en/eval.json";

// The hook module is the seam: the modal only reads two runs by id. One stable object per id.
const mocks = vi.hoisted(() => ({ runs: {} as Record<string, { data: unknown }> }));
vi.mock("@/lib/hooks/evals", () => ({
  useEvalRun: (runId: string) => mocks.runs[runId] ?? { data: undefined },
}));

import { CompareModal } from "./CompareModal";

type Config = EvalSuiteRunDetail["config"];

function config(over: Partial<Config> = {}): Config {
  return {
    agent_version: 1,
    system_prompt: "Be strict. Ignore style nits.",
    provider: "openai",
    model: "gpt-x",
    strategy: "single-pass",
    skills: [],
    ...over,
  } as Config;
}

const caseResult = (name: string, outcome: "pass" | "fail" | "errored") =>
  ({ id: name, case_name: name, outcome }) as unknown as EvalCaseResult;

function detail(id: string, over: Partial<EvalSuiteRunDetail> = {}, results: EvalCaseResult[] = []): EvalSuiteRunDetail {
  return {
    id,
    agent_id: "a1",
    agent_name: "Security Reviewer",
    status: "done",
    config: config(),
    recall: 1,
    precision: 1,
    citation_accuracy: 1,
    cases_total: 2,
    cases_done: 2,
    cases_passed: 2,
    cases_errored: 0,
    cost_usd: 0.004,
    started_at: new Date(2026, 9, 30, 10, 0).toISOString(),
    finished_at: null,
    error: null,
    results,
    ...over,
  } as EvalSuiteRunDetail;
}

function load(oldRun: EvalSuiteRunDetail, newRun: EvalSuiteRunDetail) {
  mocks.runs = { [oldRun.id]: { data: oldRun }, [newRun.id]: { data: newRun } };
}

const onClose = vi.fn();

function renderModal() {
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <CompareModal oldRunId="old" newRunId="new" onClose={onClose} />
    </NextIntlClientProvider>,
  );
}

/** The tile with this label: label div -> tile. */
const tile = (label: string) => screen.getByText(label).parentElement!;

beforeEach(() => {
  mocks.runs = {};
  onClose.mockClear();
});
afterEach(cleanup);

describe("CompareModal", () => {
  it("renders nothing until both runs are loaded", () => {
    mocks.runs = { old: { data: detail("old") } };
    renderModal();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the title, the four tiles with signed deltas, and scrolls its body inside 560 px", () => {
    load(
      detail("old", { recall: 0.5, precision: 1, citation_accuracy: 0.67, cost_usd: 0.004 }),
      detail("new", { config: config({ agent_version: 2 }), recall: 1, precision: 1, citation_accuracy: 1, cost_usd: 0.003 }),
    );
    renderModal();

    expect(screen.getByRole("dialog")).toHaveTextContent("Compare runs · v1 → v2");
    expect(screen.getByText("Old prompt vs new — metric deltas and prompt diff on 2 cases")).toBeInTheDocument();

    const recall = tile("Recall");
    expect(within(recall).getByText("50%")).toBeInTheDocument();
    expect(within(recall).getByText("100%")).toBeInTheDocument();
    expect(within(recall).getByText("▲ +50pt")).toBeInTheDocument();

    const precision = tile("Precision");
    expect(within(precision).getAllByText("100%")).toHaveLength(2);
    expect(within(precision).getByText("±0pt")).toBeInTheDocument();

    const citation = tile("Citation");
    expect(within(citation).getByText("67%")).toBeInTheDocument();
    expect(within(citation).getByText("▲ +33pt")).toBeInTheDocument();

    const cost = tile("Cost");
    expect(within(cost).getByText("$0.0040")).toBeInTheDocument();
    expect(within(cost).getByText("$0.0030")).toBeInTheDocument();
    expect(within(cost).getByText("−$0.0010")).toBeInTheDocument();

    // tiles -> tiles container -> scrolling body
    const body = cost.parentElement!.parentElement!;
    expect(body).toHaveStyle({ maxHeight: "560px", overflow: "auto" });
  });

  it("shows an em-dash and no delta for a null cost or a null metric", () => {
    load(detail("old", { cost_usd: null, recall: null }), detail("new", { cost_usd: 0.003, recall: 1 }));
    renderModal();
    const cost = tile("Cost");
    expect(within(cost).getByText("—")).toBeInTheDocument();
    expect(within(cost).getByText("$0.0030")).toBeInTheDocument();
    expect(within(cost).queryByText(/^[+−±]\$/)).toBeNull();
    const recall = tile("Recall");
    expect(within(recall).getByText("—")).toBeInTheDocument();
    expect(within(recall).queryByText(/pt$/)).toBeNull();
  });

  it("shows the prompt diff and no configuration block when only the prompt changed", () => {
    load(
      detail("old", { config: config({ system_prompt: "Be strict. Ignore style nits." }) }),
      detail("new", { config: config({ agent_version: 2, system_prompt: "Be strict." }) }),
    );
    renderModal();
    expect(screen.getByText("System prompt diff")).toBeInTheDocument();
    expect(screen.getByText("v1 (old)")).toBeInTheDocument();
    expect(screen.getByText("v2 (new)")).toBeInTheDocument();
    expect(screen.getByText("Ignore style nits.")).toBeInTheDocument();
    expect(screen.queryByText("Configuration")).toBeNull();
    expect(screen.queryByText("No config change between these runs")).toBeNull();
  });

  it("shows each run's model and skills when the model or the skills differ", () => {
    load(
      detail("old", { config: config({ model: "gpt-x", skills: [] }) }),
      detail("new", {
        config: config({ agent_version: 2, model: "gpt-y", skills: [{ name: "sql", version: 3 }] as Config["skills"] }),
      }),
    );
    renderModal();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Model: gpt-x")).toBeInTheDocument();
    expect(screen.getByText("Model: gpt-y")).toBeInTheDocument();
    expect(screen.getByText("Skills: none")).toBeInTheDocument();
    expect(screen.getByText("Skills: sql@v3")).toBeInTheDocument();
  });

  it("says there is no config change, and draws no diff, when prompt, model and skills are equal", () => {
    load(detail("old"), detail("new", { config: config({ agent_version: 2 }) }));
    renderModal();
    expect(screen.getByText("No config change between these runs")).toBeInTheDocument();
    expect(screen.queryByText("System prompt diff")).toBeNull();
    expect(screen.queryByText("Configuration")).toBeNull();
  });

  it("lists the cases that changed result, or says none did", () => {
    load(
      detail("old", {}, [caseResult("no-n-plus-one-user-list", "fail"), caseResult("steady", "pass")]),
      detail("new", {}, [caseResult("no-n-plus-one-user-list", "pass"), caseResult("steady", "pass")]),
    );
    renderModal();
    expect(screen.getByText("Cases that changed result")).toBeInTheDocument();
    expect(screen.getByText("no-n-plus-one-user-list: fail → pass")).toBeInTheDocument();
    expect(screen.queryByText(/steady:/)).toBeNull();
    expect(screen.queryByText("No case changed result")).toBeNull();

    cleanup();
    load(detail("old", {}, [caseResult("steady", "pass")]), detail("new", {}, [caseResult("steady", "pass")]));
    renderModal();
    expect(screen.getByText("No case changed result")).toBeInTheDocument();
  });

  it("renders prompt text literally and builds no HTML from it", () => {
    const evil = "<script>alert(1)</script><img src=x onerror=alert(2)>";
    load(
      detail("old", { config: config({ system_prompt: "Be strict." }) }),
      detail("new", { config: config({ agent_version: 2, system_prompt: `Be strict. ${evil}` }) }),
    );
    renderModal();
    expect(screen.getByText(evil, { exact: false })).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("Close in the footer calls onClose", async () => {
    const user = userEvent.setup();
    load(detail("old"), detail("new"));
    renderModal();
    const footer = screen.getAllByRole("button", { name: "Close" }).at(-1)!;
    await user.click(footer);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
