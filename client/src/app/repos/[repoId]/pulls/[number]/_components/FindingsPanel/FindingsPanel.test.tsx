import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseRecord, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

// The eval hooks sit under every FindingCard. Like the real hook, the mock answers with cases
// only for the agent that owns them. Nothing here depends on the identity of the returned objects.
const hookData: { casesByAgent: Record<string, Pick<EvalCaseRecord, "source_finding_id">[]> } = {
  casesByAgent: {},
};
const createCase = { mutate: vi.fn(), isPending: false, isSuccess: false, isError: false };

vi.mock("@/lib/hooks/evals", async () => ({
  ...(await vi.importActual<typeof import("@/lib/hooks/evals")>("@/lib/hooks/evals")),
  useAgentEvalCases: (agentId: string | null) => ({
    data: agentId && hookData.casesByAgent[agentId] ? { cases: hookData.casesByAgent[agentId] } : undefined,
  }),
  useCreateEvalCase: () => createCase,
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  hookData.casesByAgent = {};
});

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

const MIXED_FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
  {
    id: "f2",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "Loop issues one query per user.",
    suggestion: null,
    confidence: 0.4,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" agentId={null} />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" agentId={null} />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — the producing agent", () => {
  it("hands its agent id to the cards: the control reads that agent's eval cases", () => {
    hookData.casesByAgent = { a1: [{ source_finding_id: "f1" }] };
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" agentId="a1" />);
    expect(screen.getByText("In eval set")).toBeInTheDocument();
  });

  it("gives a panel without an agent cards that cannot become cases", () => {
    hookData.casesByAgent = { a1: [{ source_finding_id: "f1" }] };
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" agentId={null} />);
    expect(screen.queryByText("In eval set")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toHaveAccessibleDescription(
      "No agent for this finding",
    );
  });
});

describe("FindingsPanel severity counter + filter", () => {
  it("shows a pill per non-zero severity and both finding cards", () => {
    renderWithIntl(<FindingsPanel findings={MIXED_FINDINGS} prId="pr1" agentId={null} />);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    // The filter row always renders all three chips (incl. Suggestion, count 0),
    // but the read-only pill row only renders a pill for a non-zero severity —
    // so "Suggestion" appears once (the chip), never as a second, pill copy.
    expect(screen.getAllByText("Suggestion")).toHaveLength(1);
  });

  it("filters to one severity on click, and restores on a second click of the same chip", () => {
    renderWithIntl(<FindingsPanel findings={MIXED_FINDINGS} prId="pr1" agentId={null} />);
    const criticalChip = screen.getByRole("button", { name: /Critical/ });

    fireEvent.click(criticalChip);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();

    fireEvent.click(criticalChip);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
  });

  it("keeps the pill counts unchanged while the filter narrows the cards below", () => {
    renderWithIntl(<FindingsPanel findings={MIXED_FINDINGS} prId="pr1" agentId={null} />);
    const countBefore = screen.getAllByText("1").length; // both pills read "1"

    fireEvent.click(screen.getByRole("button", { name: /Warning/ }));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBe(countBefore);
  });

  it("composes the severity filter with hideLow (AND)", () => {
    renderWithIntl(<FindingsPanel findings={MIXED_FINDINGS} prId="pr1" agentId={null} />);
    // f2 (WARNING) is below the low-confidence threshold (0.4 < 0.65).
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: /Warning/ }));
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});
