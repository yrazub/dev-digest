import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { BriefInput, PrBriefRecord, PrBriefResponse } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../../messages/en/brief.json";

// The hook module is the seam: the section reads the stored brief and calls the mutation.
// Both mutation objects are built once, so the component sees a stable identity.
const mocks = vi.hoisted(() => ({
  query: {
    data: undefined as PrBriefResponse | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  generate: {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null as unknown,
  },
  intentProps: vi.fn(),
  blastProps: vi.fn(),
}));
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => mocks.query,
  useGenerateBrief: () => mocks.generate,
}));

// The two cards have tests of their own; here they only record the props they got.
vi.mock("../IntentCard", () => ({
  IntentCard: (props: unknown) => {
    mocks.intentProps(props);
    return <section aria-label="Intent card" />;
  },
}));
vi.mock("../BlastRadiusCard", () => ({
  BlastRadiusCard: (props: unknown) => {
    mocks.blastProps(props);
    return <section aria-label="Blast card" />;
  },
}));

import { PrBriefSection } from "./PrBriefSection";

const BRIEF: PrBriefRecord = {
  pr_id: "pr1",
  summary: "Adds a rate limiter in front of the public API.",
  intent: null,
  blast: null,
  risks: { risks: [] },
  review_focus: [],
  history: { history: [] },
  head_sha: "0123456789abcdef",
  generated_at: "2026-10-18T09:00:00.000Z",
  provider: "openai",
  model: "gpt-4.1-mini",
  tokens_in: 1500,
  tokens_out: 300,
  cost_usd: 0.0123,
  input_tokens: 1234,
  input_budget_tokens: 8000,
  inputs: [],
  dropped: { risks: 0, review_focus: 0 },
  stale: false,
};

const input = (
  kind: BriefInput["kind"],
  status: BriefInput["status"],
  reason: BriefInput["reason"],
  omitted: number | null = null,
): BriefInput => ({ kind, status, reason, omitted });

function showBrief(overrides: Partial<PrBriefRecord> = {}) {
  mocks.query.data = { brief: { ...BRIEF, ...overrides } };
}

/** matchMedia is absent from jsdom: stub it, narrow or wide. */
function stubViewport(narrow: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      media: query,
      matches: narrow,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderSection(props: { poll?: boolean } = {}) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ brief: messages }}
      now={new Date("2026-10-18T12:00:00.000Z")}
    >
      <PrBriefSection prId="pr1" headSha="head1" repoId="r1" repoFullName="acme/api" poll={props.poll ?? false} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.query.data = undefined;
  mocks.query.isLoading = false;
  mocks.query.isError = false;
  mocks.query.refetch = vi.fn();
  mocks.generate.mutate = vi.fn();
  mocks.generate.isPending = false;
  mocks.generate.isError = false;
  mocks.generate.error = null;
  mocks.intentProps.mockClear();
  mocks.blastProps.mockClear();
  stubViewport(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PrBriefSection", () => {
  it("shows only the grid while the brief loads, with no Generate button", () => {
    mocks.query.isLoading = true;
    renderSection();

    const section = screen.getByRole("region", { name: "PR Brief" });
    expect(within(section).getByRole("region", { name: "Intent card" })).toBeInTheDocument();
    expect(within(section).getByRole("region", { name: "Blast card" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Brief not available yet.")).not.toBeInTheDocument();
    expect(screen.queryByText("The brief could not be loaded.")).not.toBeInTheDocument();
  });

  it("shows the empty card above the Intent and Blast cards, and generates only on click", async () => {
    const user = userEvent.setup();
    mocks.query.data = { brief: null };
    renderSection({ poll: true });

    expect(screen.getByText("PR Brief")).toBeInTheDocument();
    expect(screen.getByText("Brief not available yet.")).toBeInTheDocument();
    expect(screen.getByText("Generate a Why+Risk brief for this PR.")).toBeInTheDocument();
    // no brief yet: no Regenerate control, and no Risk areas or Review focus block
    expect(screen.queryByRole("button", { name: "Regenerate brief" })).not.toBeInTheDocument();
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
    expect(screen.queryByText("Review focus — read these first")).not.toBeInTheDocument();

    // the empty card comes before the grid
    const generate = screen.getByRole("button", { name: "Generate brief" });
    const intent = screen.getByRole("region", { name: "Intent card" });
    expect(generate.compareDocumentPosition(intent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // reading on mount never generates
    expect(mocks.generate.mutate).not.toHaveBeenCalled();
    await user.click(generate);
    expect(mocks.generate.mutate).toHaveBeenCalledTimes(1);

    // the cards get what they need; the Intent card hides its tag row and has no footer yet
    expect(mocks.intentProps).toHaveBeenLastCalledWith({ prId: "pr1", poll: true, hideRiskTags: true, footer: null });
    expect(mocks.blastProps).toHaveBeenLastCalledWith({
      prId: "pr1",
      repoId: "r1",
      repoFullName: "acme/api",
      headSha: "head1",
    });
  });

  it("renders the summary as text above a two-column grid, Intent first, then the footer", () => {
    showBrief({ summary: "<b>bold</b> **x**" });
    renderSection();

    const section = screen.getByRole("region", { name: "PR Brief" });
    const summary = screen.getByText("<b>bold</b> **x**");
    expect(section.querySelector("b")).toBeNull();

    const intent = screen.getByRole("region", { name: "Intent card" });
    const blast = screen.getByRole("region", { name: "Blast card" });
    expect(summary.compareDocumentPosition(intent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(intent.compareDocumentPosition(blast) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(intent.parentElement).toHaveStyle({ display: "grid", gridTemplateColumns: "1fr 1fr" });
    expect(intent.parentElement).toBe(blast.parentElement);

    const footer = screen.getByText("gpt-4.1-mini");
    expect(blast.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("stacks the grid in one column, Intent card first, on a narrow viewport", () => {
    stubViewport(true);
    showBrief();
    renderSection();

    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 899px)");
    const intent = screen.getByRole("region", { name: "Intent card" });
    const blast = screen.getByRole("region", { name: "Blast card" });
    expect(intent.parentElement).toHaveStyle({ gridTemplateColumns: "1fr" });
    expect(intent.compareDocumentPosition(blast) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the footer: model, cost, relative time and tokens, with a dropped line when counts are above zero", () => {
    showBrief({ dropped: { risks: 2, review_focus: 1 } });
    renderSection();

    expect(screen.getByText("gpt-4.1-mini")).toHaveClass("mono");
    expect(screen.getByText("$0.0123")).toBeInTheDocument();
    expect(screen.getByText("generated 3 hours ago")).toBeInTheDocument();
    expect(screen.getByText("1,234 / 8,000 tokens in")).toBeInTheDocument();
    expect(
      screen.getByText("Dropped: 2 risks, 1 review-focus items — file not in this PR or its blast radius"),
    ).toBeInTheDocument();
  });

  it("leaves out a null cost and null input tokens, and the dropped line when both counts are zero", () => {
    showBrief({ cost_usd: null, input_tokens: null });
    renderSection();

    expect(screen.getByText("gpt-4.1-mini")).toBeInTheDocument();
    expect(screen.getByText("generated 3 hours ago")).toBeInTheDocument();
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/tokens in/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dropped:/)).not.toBeInTheDocument();
  });

  it("names every missing input with its reason", () => {
    showBrief({
      inputs: [
        input("intent", "missing", "not_derived"),
        input("blast_radius", "missing", "no_data"),
        input("linked_issue", "missing", "no_token"),
        input("spec_documents", "missing", "none_attached"),
        input("diff_stats", "used", null),
      ],
    });
    renderSection();

    expect(
      screen.getByText(
        "Generated without: Intent (not derived yet), Blast radius (no data), Linked issue (no GitHub token), Spec documents (none attached)",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/trimmed:/)).not.toBeInTheDocument();
  });

  it("names the trimmed inputs with their reason and the number left out", () => {
    showBrief({
      inputs: [
        input("spec_documents", "trimmed", "over_budget", 2),
        input("blast_radius", "trimmed", "over_budget", 5),
        input("intent", "used", null),
      ],
    });
    renderSection();

    expect(
      screen.getByText("trimmed: Spec documents (over budget), 2 left out, Blast radius (over budget), 5 left out"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Generated without/)).not.toBeInTheDocument();
  });

  it("shows no inputs line when every input was used", () => {
    showBrief({ inputs: [input("intent", "used", null), input("description", "used", null)] });
    renderSection();
    expect(screen.queryByText(/Generated without/)).not.toBeInTheDocument();
    expect(screen.queryByText(/trimmed:/)).not.toBeInTheDocument();
  });

  it("regenerates from the labelled icon button and keeps the cached brief", async () => {
    const user = userEvent.setup();
    showBrief();
    renderSection();

    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Regenerate brief" }));
    expect(mocks.generate.mutate).toHaveBeenCalledTimes(1);
  });

  it("marks a stale brief with the short SHA and regenerates from the mark", async () => {
    const user = userEvent.setup();
    showBrief({ stale: true });
    renderSection();

    expect(screen.getByText("Generated for 0123456; the PR has newer commits")).toBeInTheDocument();
    // the header button and the stale mark share the name
    const controls = screen.getAllByRole("button", { name: "Regenerate brief" });
    expect(controls).toHaveLength(2);
    const staleLine = screen.getByText(/the PR has newer commits/).closest("p");
    const action = within(staleLine as HTMLElement).getByRole("button", { name: "Regenerate brief" });

    await user.click(action);
    expect(mocks.generate.mutate).toHaveBeenCalledTimes(1);
  });

  it("shows no stale mark for a fresh brief", () => {
    showBrief({ stale: false });
    renderSection();
    expect(screen.queryByText(/the PR has newer commits/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Regenerate brief" })).toHaveLength(1);
  });

  it("keeps the cached brief while generating and swaps Regenerate for a disabled Generating button", () => {
    showBrief({ stale: true });
    mocks.generate.isPending = true;
    renderSection();

    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate brief" })).not.toBeInTheDocument();
    const pending = screen.getAllByRole("button", { name: "Generating…" });
    expect(pending.length).toBeGreaterThan(0);
    pending.forEach((button) => expect(button).toBeDisabled());
  });

  it("disables the Generate button with Generating… while the first brief is generated", () => {
    mocks.query.data = { brief: null };
    mocks.generate.isPending = true;
    renderSection();

    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
    const pending = screen.getAllByRole("button", { name: "Generating…" });
    pending.forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByRole("region", { name: "Intent card" })).toBeInTheDocument();
  });

  it("shows a load failure with a Retry that refetches, and no Generate button", async () => {
    const user = userEvent.setup();
    mocks.query.isError = true;
    renderSection();

    expect(screen.getByText("The brief could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
    expect(screen.queryByText("Brief not available yet.")).not.toBeInTheDocument();
    // the cards stay visible
    expect(screen.getByRole("region", { name: "Intent card" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Blast card" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.query.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mutate).not.toHaveBeenCalled();
  });

  it("keeps the stored brief when a background refetch fails", () => {
    showBrief();
    mocks.query.isError = true;
    renderSection();

    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
    expect(screen.queryByText("The brief could not be loaded.")).not.toBeInTheDocument();
  });

  it("explains a missing key with the API message and a link to Settings, and keeps the brief", () => {
    showBrief();
    mocks.generate.isError = true;
    mocks.generate.error = new ApiError("No provider key is configured", 400, "brief_unavailable");
    renderSection();

    expect(screen.getByText("No provider key is configured")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add the key in Settings" })).toHaveAttribute(
      "href",
      "/settings/api-keys",
    );
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
  });

  it("shows any other generate error as its message, without the Settings link, and keeps the brief", () => {
    showBrief();
    mocks.generate.isError = true;
    mocks.generate.error = new ApiError("The model timed out", 504, "timeout");
    renderSection();

    expect(screen.getByText("The model timed out")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(BRIEF.summary)).toBeInTheDocument();
  });
});
