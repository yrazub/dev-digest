import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseResult, EvalSuiteRunDetail } from "@devdigest/shared";
import messages from "../../../messages/en/eval.json";

// The hook module is the seam: the drawer only reads one run. One stable object per state.
const mocks = vi.hoisted(() => ({
  query: { data: undefined as EvalSuiteRunDetail | undefined, isError: false },
  runIds: [] as string[],
}));
vi.mock("@/lib/hooks/evals", () => ({
  useEvalRun: (runId: string) => {
    mocks.runIds.push(runId);
    return mocks.query;
  },
}));

import { RunDrawer } from "./RunDrawer";

function result(id: string, over: Partial<EvalCaseResult>): EvalCaseResult {
  return {
    id,
    suite_run_id: "run1",
    case_name: `case-${id}`,
    kind: "must_find",
    expectation: {
      kind: "must_find",
      file: "src/a.ts",
      start_line: 1,
      end_line: 2,
      title: "t",
      severity: "CRITICAL",
      category: "security",
    },
    outcome: "pass",
    actual_output: { findings: [], dropped: 0 },
    error: null,
    ...over,
  } as unknown as EvalCaseResult;
}

function detail(results: EvalCaseResult[], over: Partial<EvalSuiteRunDetail> = {}): EvalSuiteRunDetail {
  return {
    id: "run1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    status: "done",
    config: { agent_version: 3, system_prompt: "p", provider: "openai", model: "m", strategy: "single-pass", skills: [] },
    recall: 0.5,
    precision: 0.5,
    citation_accuracy: 1,
    cases_total: results.length,
    cases_done: results.length,
    cases_passed: 1,
    cases_errored: 0,
    cost_usd: 0.004,
    started_at: new Date(2026, 9, 30, 10, 0).toISOString(),
    finished_at: null,
    error: null,
    results,
    ...over,
  } as EvalSuiteRunDetail;
}

const FINDING = {
  file: "src/auth.ts",
  start_line: 10,
  end_line: 14,
  title: "Hardcoded key",
  severity: "CRITICAL" as const,
  category: "security" as const,
};

beforeEach(() => {
  mocks.query.data = undefined;
  mocks.query.isError = false;
  mocks.runIds.length = 0;
});

function ui(onClose: () => void, returnFocusTo: HTMLElement | null = null, withTrigger = false) {
  return (
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {withTrigger && <button type="button">Open run</button>}
      <RunDrawer runId="run1" onClose={onClose} returnFocusTo={returnFocusTo} />
    </NextIntlClientProvider>
  );
}

describe("RunDrawer content", () => {
  it("lists each case with its outcome, kind, findings, matches mark, dropped count and error", () => {
    mocks.query.data = detail([
      result("1", {
        case_name: "stripe-key-leak",
        outcome: "pass",
        actual_output: {
          findings: [
            { ...FINDING, matches: true },
            { ...FINDING, file: "src/other.ts", start_line: 3, end_line: 3, title: "Unrelated", matches: false },
          ],
          dropped: 2,
        },
      }),
      result("2", { case_name: "no-flag", kind: "must_not_flag", outcome: "fail" }),
      result("3", { case_name: "broken", outcome: "errored", actual_output: null, error: "No diff available for a.ts" }),
    ]);
    render(ui(vi.fn()));

    expect(mocks.runIds[0]).toBe("run1");
    const dialog = screen.getByRole("dialog", { name: "Run details" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("Run v3 · 2026-10-30 10:00")).toBeInTheDocument();

    const items = within(dialog).getAllByRole("listitem").filter((li) => li.querySelector('[role="img"]'));
    expect(items).toHaveLength(3);

    const [first, second, third] = items as [HTMLElement, HTMLElement, HTMLElement];
    expect(within(first).getByRole("img", { name: "pass" })).toBeInTheDocument();
    expect(within(first).getByText("stripe-key-leak")).toBeInTheDocument();
    expect(within(first).getByText("must find")).toBeInTheDocument();
    // the path and the line range are separate spans (the range never truncates)
    expect(within(first).getByText("src/auth.ts")).toBeInTheDocument();
    expect(within(first).getByText(":10-14")).toBeInTheDocument();
    expect(within(first).getByText("Hardcoded key")).toBeInTheDocument();
    // exactly one finding is marked as matching
    expect(within(first).getAllByText("matches")).toHaveLength(1);
    expect(within(first).getByText("2 findings dropped")).toBeInTheDocument();

    expect(within(second).getByRole("img", { name: "fail" })).toBeInTheDocument();
    expect(within(second).getByText("must not flag")).toBeInTheDocument();
    expect(within(second).getByText("No findings")).toBeInTheDocument();
    expect(within(second).queryByText(/dropped/)).not.toBeInTheDocument();

    expect(within(third).getByRole("img", { name: "errored" })).toBeInTheDocument();
    expect(within(third).getByText("No diff available for a.ts")).toBeInTheDocument();
  });

  it("shortens a long path from the left but keeps the full line range and the full location in the title", () => {
    const longFile = "packages/billing/src/lib/format/duration.ts";
    mocks.query.data = detail([
      result("1", {
        outcome: "pass",
        actual_output: {
          findings: [
            { ...FINDING, file: longFile, start_line: 116, end_line: 128, title: "Off by one", matches: true },
            { ...FINDING, file: "src/short.ts", start_line: 1, end_line: 2, title: "Short path", matches: false },
          ],
          dropped: 0,
        },
      }),
    ]);
    render(ui(vi.fn()));

    expect(screen.getByText("…/src/lib/format/duration.ts")).toBeInTheDocument();
    expect(screen.queryByText(longFile)).not.toBeInTheDocument();
    expect(screen.getByText(":116-128")).toBeInTheDocument();
    // the whole location stays reachable on hover
    expect(screen.getByTitle(`${longFile}:116-128`)).toBeInTheDocument();
    // a path that fits is shown whole
    expect(screen.getByText("src/short.ts")).toBeInTheDocument();
    expect(screen.getByText(":1-2")).toBeInTheDocument();
  });

  it("shows what a failed must_find case expected next to the range the agent actually reported", () => {
    mocks.query.data = detail([
      result("1", {
        case_name: "off-by-one",
        kind: "must_find",
        outcome: "fail",
        expectation: {
          kind: "must_find",
          file: "src/format/duration.ts",
          start_line: 17,
          end_line: 17,
          title: "t",
          severity: "CRITICAL",
          category: "security",
        } as EvalCaseResult["expectation"],
        actual_output: {
          findings: [{ ...FINDING, file: "src/format/duration.ts", start_line: 16, end_line: 16, matches: false }],
          dropped: 0,
        },
      }),
    ]);
    render(ui(vi.fn()));

    expect(screen.getByText("Expected src/format/duration.ts:17-17")).toBeInTheDocument();
    // the finding's own range is visible, so the one-line miss can be seen
    expect(screen.getByText(":16-16")).toBeInTheDocument();
    expect(screen.queryByText("matches")).not.toBeInTheDocument();
  });

  it("shows what a failed must_not_flag case must not flag", () => {
    mocks.query.data = detail([
      result("1", {
        case_name: "no-flag",
        kind: "must_not_flag",
        outcome: "fail",
        expectation: {
          kind: "must_not_flag",
          file: "src/safe.ts",
          start_line: 5,
          end_line: 9,
        } as EvalCaseResult["expectation"],
        actual_output: {
          findings: [{ ...FINDING, file: "src/safe.ts", start_line: 6, end_line: 7, matches: false }],
          dropped: 0,
        },
      }),
    ]);
    render(ui(vi.fn()));

    expect(screen.getByText("Must not flag src/safe.ts:5-9")).toBeInTheDocument();
    expect(screen.queryByText(/^Expected /)).not.toBeInTheDocument();
  });

  it("shows no expectation line for a passed or an errored case", () => {
    mocks.query.data = detail([
      result("1", { case_name: "ok", outcome: "pass" }),
      result("2", {
        case_name: "ok-not-flag",
        kind: "must_not_flag",
        outcome: "pass",
        expectation: { kind: "must_not_flag", file: "src/safe.ts", start_line: 5, end_line: 9 } as EvalCaseResult["expectation"],
      }),
      result("3", { case_name: "broken", outcome: "errored", actual_output: null, error: "boom" }),
    ]);
    render(ui(vi.fn()));

    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(screen.getByText("broken")).toBeInTheDocument();
    expect(screen.queryByText(/^Expected /)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Must not flag /)).not.toBeInTheDocument();
  });

  it("uses the singular for one dropped finding and shows a failed run's own error", () => {
    mocks.query.data = detail(
      [result("1", { actual_output: { findings: [], dropped: 1 } })],
      { status: "failed", error: "All 1 cases failed: boom" },
    );
    render(ui(vi.fn()));
    expect(screen.getByText("1 finding dropped")).toBeInTheDocument();
    expect(screen.getByText("All 1 cases failed: boom")).toBeInTheDocument();
  });

  it("renders case, finding and error text literally, never as markup", () => {
    mocks.query.data = detail([
      result("1", {
        case_name: "<b>bold-name</b>",
        outcome: "fail",
        actual_output: { findings: [{ ...FINDING, title: "<b>bold-title</b>", matches: false }], dropped: 0 },
        error: "<b>bold-error</b>",
      }),
    ]);
    render(ui(vi.fn()));
    expect(screen.getByText("<b>bold-name</b>")).toBeInTheDocument();
    expect(screen.getByText("<b>bold-title</b>")).toBeInTheDocument();
    expect(screen.getByText("<b>bold-error</b>")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
  });

  it("shows a loading line while the run loads and an error line when it cannot be read", () => {
    const { unmount } = render(ui(vi.fn()));
    expect(screen.getByText("Loading run…")).toBeInTheDocument();
    unmount();

    mocks.query.isError = true;
    render(ui(vi.fn()));
    expect(screen.getByText("Could not load this run.")).toBeInTheDocument();
  });
});

describe("RunDrawer closing and focus", () => {
  it("Esc and the close button each call onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mocks.query.data = detail([]);
    render(ui(onClose));

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close run details" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("moves focus into the drawer on open and gives it back to the opener on close", () => {
    mocks.query.data = detail([]);
    const opener = document.createElement("div");
    opener.tabIndex = 0;
    document.body.appendChild(opener);

    const view = render(ui(vi.fn(), opener));
    expect(screen.getByRole("button", { name: "Close run details" })).toHaveFocus();

    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("does not throw when there is no element to return focus to", () => {
    mocks.query.data = detail([]);
    const view = render(ui(vi.fn(), null));
    expect(() => view.unmount()).not.toThrow();
  });
});
