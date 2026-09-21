/**
 * ReviewRunAccordion — the header shows the run's cost between the score badge
 * and the date; nothing renders when the cost is unknown. A known zero is a
 * claim and still renders.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ReviewRecord } from "@devdigest/shared";

// The header's delete button uses a TanStack mutation; no query client here.
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useDeleteReview: () => ({ mutate: vi.fn(), isPending: false }),
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
