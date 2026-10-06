import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.0013, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

// Reassignable so a case can serve a trace written before cost_usd existed.
let current: RunTrace = TRACE;
vi.mock("@/lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: current, isLoading: false }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  cleanup();
  current = TRACE;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("shows the run cost in a COST tile between TOKENS and FINDINGS", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    const labels = ["DURATION", "TOKENS", "COST", "FINDINGS"].map((l) => screen.getByText(l));
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
    // DOM order matches the design: DURATION · TOKENS · COST · FINDINGS
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i - 1]!.compareDocumentPosition(labels[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("shows — for a trace written before cost_usd existed (field undefined)", () => {
    const { cost_usd: _omitted, ...legacyStats } = TRACE.stats;
    current = { ...TRACE, stats: legacyStats as RunTrace["stats"] };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("COST").nextElementSibling).toHaveTextContent("—");
    expect(screen.queryByText("$0.0000")).not.toBeInTheDocument();
  });

  it("lists the skills loaded into the run and the skills block's token count (#19)", () => {
    current = {
      ...TRACE,
      prompt_assembly: {
        ...TRACE.prompt_assembly,
        skills: "### branch-coverage (v1)\nRule.\n\n### edge-cases (v3)\nRule.",
        skills_tokens: 42,
        skills_loaded: [
          { name: "branch-coverage", version: 1 },
          { name: "edge-cases", version: 3 },
        ],
      },
    };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Skills loaded")).toBeInTheDocument();
    const first = screen.getByText("branch-coverage v1");
    const second = screen.getByText("edge-cases v3");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("~42 tokens")).toBeInTheDocument();
  });

  it("hides the Skills loaded row when no skills were injected (#20)", () => {
    current = { ...TRACE, prompt_assembly: { ...TRACE.prompt_assembly, skills: null } };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.queryByText("Skills loaded")).toBeNull();
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.queryByText("Skills (dynamic)")).toBeNull();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("shows the count of findings the scope filter removed next to the grounding badge", () => {
    current = { ...TRACE, stats: { ...TRACE.stats, scope_filtered: 2 } };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    const count = screen.getByText("2 out-of-scope filtered");
    expect(count).toBeInTheDocument();
    // same slot as the grounding badge, which stays
    const grounding = screen.getByText("2/2 passed");
    expect(grounding.compareDocumentPosition(count) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ["null", { scope_filtered: null }],
    ["0", { scope_filtered: 0 }],
    ["absent", {}],
  ])("shows no filtered count when scope_filtered is %s", (_label, extra) => {
    current = { ...TRACE, stats: { ...TRACE.stats, ...extra } };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.queryByText(/out-of-scope filtered/)).not.toBeInTheDocument();
  });

  it("lists a classify_intent entry before review_file", () => {
    current = {
      ...TRACE,
      tool_calls: [
        { tool: "classify_intent", args: "openai/gpt-4.1-mini", meta: "cached", ms: 0 },
        ...TRACE.tool_calls,
      ],
    };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    const intent = screen.getByText("classify_intent");
    const review = screen.getByText("review_file");
    expect(intent.compareDocumentPosition(review) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
