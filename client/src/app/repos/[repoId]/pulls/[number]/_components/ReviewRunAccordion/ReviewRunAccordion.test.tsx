/**
 * ReviewRunAccordion — the header shows the run's cost between the score badge
 * and the date; nothing renders when the cost is unknown. A known zero is a
 * claim and still renders.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";

// The header's delete button uses a TanStack mutation; no query client here. The open body
// renders a FindingsPanel, whose cards act through `useFindingAction` and the eval hooks.
vi.mock("@/lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

// Like the real hook, the mock answers with cases only for the agent that owns them.
vi.mock("@/lib/hooks/evals", async () => ({
  ...(await vi.importActual<typeof import("@/lib/hooks/evals")>("@/lib/hooks/evals")),
  useAgentEvalCases: (agentId: string | null) => ({
    data: agentId === "a1" ? { cases: [{ source_finding_id: "f1" }] } : undefined,
  }),
  useCreateEvalCase: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false }),
}));

import { ReviewRunAccordion } from "./ReviewRunAccordion";

afterEach(cleanup);

const REVIEW: ReviewRecord = {
  id: "rv-1",
  pr_id: "pr-1",
  agent_id: "a1",
  run_id: "run-1",
  agent_name: "Security Reviewer",
  kind: "review",
  verdict: "comment",
  summary: "ok",
  score: 72,
  model: "gpt-4.1",
  grounding: "1/1 passed",
  created_at: "2026-06-11T18:44:34.000Z",
  findings: [],
};

const renderAccordion = (costUsd?: number | null) =>
  render(<ReviewRunAccordion review={REVIEW} prId="pr-1" costUsd={costUsd} />);

describe("ReviewRunAccordion — cost in the header", () => {
  it("renders the run cost at four decimals", () => {
    renderAccordion(0.0013);
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("renders a known zero cost", () => {
    renderAccordion(0);
    expect(screen.getByText("$0.0000")).toBeInTheDocument();
  });

  it("renders nothing when the cost is null or the prop is omitted", () => {
    renderAccordion(null);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    cleanup();
    renderAccordion();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});

describe("ReviewRunAccordion — the agent of the run reaches its findings", () => {
  const FINDING: FindingRecord = {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "Unchecked input",
    file: "src/a.ts",
    start_line: 3,
    end_line: 3,
    rationale: "Input is not validated.",
    suggestion: null,
    confidence: 0.9,
    review_id: "rv-1",
    accepted_at: "2026-10-04T00:00:00Z",
    dismissed_at: null,
  };

  const renderOpen = (review: ReviewRecord) =>
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview }}>
        <ReviewRunAccordion review={review} prId="pr-1" defaultOpen />
      </NextIntlClientProvider>,
    );

  it("lets a finding card look up the cases of review.agent_id", () => {
    renderOpen({ ...REVIEW, findings: [FINDING] });
    expect(screen.getByText("In eval set")).toBeInTheDocument();
  });

  it("gives a run with no agent cards whose eval control is disabled", () => {
    renderOpen({ ...REVIEW, agent_id: null, findings: [FINDING] });
    expect(screen.queryByText("In eval set")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toHaveAccessibleDescription(
      "No agent for this finding",
    );
  });
});
