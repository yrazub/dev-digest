/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    findings_by_severity: null,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — token + cost line", () => {
  it("shows thousands-grouped tokens with the cost tail under the timestamp", () => {
    renderRuns([run({ tokens_in: 8000, tokens_out: 1119, cost_usd: 0.0013 })]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("drops the cost tail for an unpriced run, keeping the token count", () => {
    renderRuns([run({ tokens_in: 8000, tokens_out: 1119, cost_usd: null })]);
    expect(screen.getByText("9,119 tok")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("renders a known zero cost rather than hiding it", () => {
    renderRuns([run({ tokens_in: 100, tokens_out: 50, cost_usd: 0 })]);
    expect(screen.getByText("150 tok · $0.0000")).toBeInTheDocument();
  });

  it("omits the whole line when the run reported no tokens", () => {
    renderRuns([run({ tokens_in: 0, tokens_out: 0, cost_usd: 0.0013 })]);
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — per-severity findings badges", () => {
  it("renders a non-interactive badge per non-zero severity when findings_by_severity is present", () => {
    renderRuns([
      run({ findings_by_severity: { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }, blockers: 2, score: 38 }),
    ]);
    // compact SeverityBadge renders icon + count only (no label); the counts are
    // the observable signal that both non-zero severities rendered, and SUGGESTION
    // (count 0) contributed no third badge.
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    // Read-only: the badges are spans, not buttons (unlike the Review-runs filter
    // chips) — the only button in a row is the unrelated "go to review" agent-name link.
    expect(screen.queryAllByRole("button", { name: /Critical|Warning|Suggestion/ })).toHaveLength(0);
  });

  it("opens the same read-only findings popover on hover, fed by the run's review findings", () => {
    const finding: FindingRecord = {
      id: "f1",
      severity: "WARNING",
      category: "perf",
      title: "N+1 query",
      file: "src/api/users.ts",
      start_line: 45,
      end_line: 52,
      rationale: "Loop issues one query per user.",
      suggestion: null,
      confidence: 0.86,
      kind: "finding",
      trifecta_components: null,
      evidence: null,
      review_id: "rv1",
      accepted_at: null,
      dismissed_at: null,
    };
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <RunHistory
          runs={[run({ findings_count: 1, findings_by_severity: { CRITICAL: 0, WARNING: 1, SUGGESTION: 0 } })]}
          onOpenTrace={() => {}}
          findingsByRunId={new Map([["run-1", [finding]]])}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.mouseEnter(screen.getByTestId("findings-popover-trigger"));
    expect(screen.getByText("1 FINDING IN THIS RUN")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
  });

  it("falls back to the flat findings-count string when findings_by_severity is absent (pre-lesson trace rows)", () => {
    renderRuns([run({ findings_by_severity: null, findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
  });
});
