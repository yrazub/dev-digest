import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("L05 Project context in the run trace", () => {
  const AUTH = "docs/auth.md";
  const RULES = "specs/rules.md";
  const withSpecs = (assembly: Partial<RunTrace["prompt_assembly"]>, specsRead: string[] = [AUTH, RULES]): RunTrace => ({
    ...TRACE,
    specs_read: specsRead,
    prompt_assembly: { ...TRACE.prompt_assembly, specs: "<project-context>as sent</project-context>", ...assembly },
  });
  const renderDrawer = () =>
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);

  it("lists each inserted path with its tokens, shows the block meta, the sent text on expand and the skipped reasons", async () => {
    const user = userEvent.setup();
    current = withSpecs({
      specs_tokens: 1700,
      specs_calls: 1,
      specs_loaded: [
        { path: AUTH, origin: "agent", skill_name: null, tokens: 1200, text: "Every route needs a bearer token." },
        { path: RULES, origin: "skill", skill_name: "edge-cases", tokens: 500, text: "Cover the empty list." },
      ],
      specs_skipped: [
        { path: "docs/gone.md", origin: "agent", skill_name: null, reason: "not_found" },
        { path: "docs/huge.md", origin: "skill", skill_name: "edge-cases", reason: "over_cap" },
        { path: "../secret.md", origin: "agent", skill_name: null, reason: "outside_clone" },
      ],
    });
    renderDrawer();

    // Specs read row: both paths, each with the tokens of its specs_loaded entry
    expect(screen.getByText("Specs read")).toBeInTheDocument();
    expect(screen.getByText(`${AUTH} ≈ 1,200 tok`)).toBeInTheDocument();
    expect(screen.getByText(`${RULES} ≈ 500 tok`)).toBeInTheDocument();

    await user.click(screen.getByText("Prompt assembly"));

    // the whole-section block carries the token meta of a single-call run
    const blockLabel = screen.getByText("Project context — attached specs (untrusted)");
    expect(blockLabel).toBeInTheDocument();
    expect(screen.getByText("~1700 tokens")).toBeInTheDocument();
    expect(screen.queryByText(/per call/)).not.toBeInTheDocument();
    expect(screen.queryByText("Project context (dynamic)")).not.toBeInTheDocument();

    // a document row shows its meta, and its text only once expanded
    expect(screen.getByText("~1200 tokens")).toBeInTheDocument();
    expect(screen.getByText("~500 tokens")).toBeInTheDocument();
    expect(screen.queryByText("Every route needs a bearer token.")).not.toBeInTheDocument();
    await user.click(screen.getByText(AUTH));
    expect(screen.getByText("Every route needs a bearer token.")).toBeInTheDocument();
    expect(screen.queryByText("Cover the empty list.")).not.toBeInTheDocument();

    // skipped entries: path and readable reason
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("docs/gone.md — file not found")).toBeInTheDocument();
    expect(screen.getByText("docs/huge.md — over the token cap")).toBeInTheDocument();
    expect(screen.getByText("../secret.md — outside the repository clone")).toBeInTheDocument();
  });

  it("reads 'per call · sent in 3 calls' when the section was sent in three calls", async () => {
    const user = userEvent.setup();
    current = withSpecs({
      specs_tokens: 900,
      specs_calls: 3,
      specs_loaded: [{ path: AUTH, origin: "agent", skill_name: null, tokens: 900, text: "Body." }],
    }, [AUTH]);
    renderDrawer();
    await user.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("≈ 900 tokens per call · sent in 3 calls")).toBeInTheDocument();
    expect(screen.queryByText("~900 tokens per call")).not.toBeInTheDocument();
  });

  it("shows 'none' and no Project context block when specs_read is empty", async () => {
    const user = userEvent.setup();
    current = withSpecs({ specs_tokens: 10, specs_calls: 1, specs_loaded: [], specs_skipped: [] }, []);
    renderDrawer();
    const row = screen.getByText("Specs read").parentElement as HTMLElement;
    expect(within(row).getByText("none")).toBeInTheDocument();
    await user.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.queryByText("Project context — attached specs (untrusted)")).not.toBeInTheDocument();
    expect(screen.queryByText("Skipped")).not.toBeInTheDocument();
  });

  it("renders a trace recorded before the new fields exist: path alone, a block without meta or extras", async () => {
    const user = userEvent.setup();
    current = withSpecs({}, [AUTH]); // no specs_tokens / specs_calls / specs_loaded / specs_skipped
    renderDrawer();
    expect(screen.getByText(AUTH)).toBeInTheDocument();
    expect(screen.queryByText(/tok$/)).not.toBeInTheDocument();
    await user.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
    expect(screen.queryByText("Skipped")).not.toBeInTheDocument();
  });
});
