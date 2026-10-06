import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord, PrIntentResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";

// The hook module is the seam: the card reads the stored intent and calls the mutation.
const mocks = vi.hoisted(() => ({
  state: {
    data: undefined as PrIntentResponse | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  mutation: { mutate: vi.fn(), isPending: false },
}));
vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => mocks.state,
  useRegenerateIntent: () => mocks.mutation,
}));

import { IntentCard } from "./IntentCard";

const RECORD: PrIntentRecord = {
  pr_id: "pr1",
  summary: "Add rate limiting to the public API",
  in_scope: ["Per-IP request limit", "429 responses"],
  out_of_scope: ["Authentication changes"],
  risk_areas: [
    { kind: "security", label: "Bypass through forwarded headers" },
    { kind: "performance", label: "Limiter lookup on every request" },
  ],
  confidence: "high",
  sources: [
    { kind: "title", ref: null, status: "used", reason: null },
    { kind: "description", ref: null, status: "used", reason: null },
    { kind: "changed_files", ref: null, status: "used", reason: null },
  ],
  missing_context: false,
  injection_suspected: false,
  stale: false,
  model: "gpt-4.1-mini",
  cost_usd: 0.0042,
  computed_at: "2026-10-01T10:00:00.000Z",
};

function show(overrides: Partial<PrIntentRecord> = {}) {
  mocks.state = { data: { intent: { ...RECORD, ...overrides } }, isLoading: false, isError: false, refetch: vi.fn() };
}

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <div data-theme="dark">
        <IntentCard prId="pr1" poll={false} />
      </div>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.state = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
  mocks.mutation.mutate.mockClear();
  mocks.mutation.isPending = false;
});
afterEach(cleanup);

describe("IntentCard", () => {
  it("renders the summary, both scope lists, the risk areas and the sources", () => {
    show({
      sources: [
        { kind: "title", ref: null, status: "used", reason: null },
        { kind: "linked_issue", ref: "#471", status: "used", reason: null },
        { kind: "spec_document", ref: "specs/rate-limit.md", status: "used", reason: null },
        { kind: "changed_files", ref: null, status: "used", reason: null },
      ],
    });
    renderCard();

    const card = screen.getByRole("region", { name: "Intent" });
    expect(within(card).getByText("“Add rate limiting to the public API”")).toBeInTheDocument();
    expect(within(card).getByText("In scope")).toBeInTheDocument();
    expect(within(card).getByText("Per-IP request limit")).toBeInTheDocument();
    expect(within(card).getByText("429 responses")).toBeInTheDocument();
    expect(within(card).getByText("Out of scope")).toBeInTheDocument();
    expect(within(card).getByText("Authentication changes")).toBeInTheDocument();
    expect(within(card).getByText("Risk areas")).toBeInTheDocument();
    expect(within(card).getByText("Bypass through forwarded headers")).toBeInTheDocument();
    expect(within(card).getByText("Limiter lookup on every request")).toBeInTheDocument();

    expect(within(card).getByText("Derived from")).toBeInTheDocument();
    expect(within(card).getByText("Title")).toBeInTheDocument();
    expect(within(card).getByText("Issue #471")).toBeInTheDocument();
    expect(within(card).getByText("specs/rate-limit.md")).toBeInTheDocument();
    expect(within(card).getByText("Changed files")).toBeInTheDocument();
    expect(within(card).getByText("gpt-4.1-mini")).toBeInTheDocument();
    expect(within(card).getByText("$0.0042")).toBeInTheDocument();
    // all sources were read: nothing is marked and no warning shows
    expect(within(card).queryByText("not read")).not.toBeInTheDocument();
    expect(within(card).queryByText(/Derived without/)).not.toBeInTheDocument();

    // risk areas and sources are badges, not buttons: the re-run control is the only button
    expect(within(card).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Re-run intent detection",
    ]);
  });

  it("shows the confidence badge, with a hint for medium and low and none for high", () => {
    show({ confidence: "medium" });
    renderCard();
    expect(screen.getByText("Medium confidence")).toBeInTheDocument();
    expect(screen.getByText(/Parts of this were inferred/)).toBeInTheDocument();
    cleanup();

    show({ confidence: "low" });
    renderCard();
    expect(screen.getByText("Low confidence")).toBeInTheDocument();
    expect(screen.getByText(/Little was stated in the PR/)).toBeInTheDocument();
    expect(screen.queryByText(/Parts of this were inferred/)).not.toBeInTheDocument();
    cleanup();

    show({ confidence: "high" });
    renderCard();
    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(screen.queryByText(/Parts of this were inferred/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Little was stated in the PR/)).not.toBeInTheDocument();
  });

  it("gives one reason for a medium tier: the missing-context warning replaces the generic hint", () => {
    show({
      confidence: "medium",
      missing_context: true,
      sources: [
        { kind: "title", ref: null, status: "used", reason: null },
        { kind: "spec_document", ref: "specs/rate-limit.md", status: "unavailable", reason: "not_found" },
      ],
    });
    renderCard();
    expect(screen.getByText(/Derived without specs\/rate-limit\.md/)).toBeInTheDocument();
    expect(screen.queryByText(/Parts of this were inferred/)).not.toBeInTheDocument();
    cleanup();

    // A low tier keeps its hint: it also says that out-of-scope filtering is off.
    show({ confidence: "low", missing_context: true });
    renderCard();
    expect(screen.getByText(/Little was stated in the PR/)).toBeInTheDocument();
  });

  it("labels a ticket in another tracker as a ticket, without the protocol, not as an issue", () => {
    show({
      confidence: "medium",
      missing_context: true,
      sources: [
        { kind: "title", ref: null, status: "used", reason: null },
        { kind: "linked_issue", ref: "#471", status: "used", reason: null },
        {
          kind: "linked_issue",
          ref: "https://acme.atlassian.net/browse/DD-142",
          status: "unavailable",
          reason: "unsupported",
        },
      ],
    });
    renderCard();
    expect(screen.getByText("Issue #471")).toBeInTheDocument();
    expect(screen.getByText("Ticket acme.atlassian.net/browse/DD-142")).toBeInTheDocument();
    expect(screen.getByText(/Derived without Ticket acme\.atlassian\.net\/browse\/DD-142 —/)).toBeInTheDocument();
    expect(screen.queryByText(/Issue https/)).not.toBeInTheDocument();
  });

  it("names the unread issue and document in the missing-context warning and marks them not read", () => {
    show({
      missing_context: true,
      sources: [
        { kind: "title", ref: null, status: "used", reason: null },
        { kind: "linked_issue", ref: "#471", status: "unavailable", reason: "not_found" },
        { kind: "spec_document", ref: "specs/rate-limit.md", status: "unavailable", reason: "fetch_failed" },
      ],
    });
    renderCard();

    expect(
      screen.getByText(
        "Derived without Issue #471 and specs/rate-limit.md — the description refers to them, but they could not be read. This intent may be incomplete.",
      ),
    ).toBeInTheDocument();
    // each unavailable source stays listed in the footer, with the suffix
    expect(screen.getByText("Issue #471")).toBeInTheDocument();
    expect(screen.getByText("specs/rate-limit.md")).toBeInTheDocument();
    expect(screen.getAllByText("not read")).toHaveLength(2);
  });

  it("lists an unavailable external link as not read without the missing-context warning", () => {
    show({
      missing_context: false,
      sources: [
        { kind: "title", ref: null, status: "used", reason: null },
        { kind: "external_link", ref: "https://example.com/design-doc", status: "unavailable", reason: "unsupported" },
      ],
    });
    renderCard();

    // the generic label, never the URL
    expect(screen.getByText("External link")).toBeInTheDocument();
    expect(screen.queryByText(/example\.com/)).not.toBeInTheDocument();
    expect(screen.getAllByText("not read")).toHaveLength(1);
    expect(screen.queryByText(/Derived without/)).not.toBeInTheDocument();
  });

  it("shows None stated for an empty scope list", () => {
    show({ in_scope: [], out_of_scope: ["Authentication changes"], risk_areas: [] });
    renderCard();

    expect(screen.getAllByText("None stated")).toHaveLength(1);
    expect(screen.getByText("Authentication changes")).toBeInTheDocument();
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
  });

  it("shows the stale line and the injection badge only when flagged", () => {
    show({ stale: false, injection_suspected: false });
    renderCard();
    expect(screen.queryByText(/The PR changed since this was derived/)).not.toBeInTheDocument();
    expect(screen.queryByText("Instruction-like text found in the PR")).not.toBeInTheDocument();
    cleanup();

    show({ stale: true, injection_suspected: true });
    renderCard();
    expect(
      screen.getByText("The PR changed since this was derived. Re-run intent detection."),
    ).toBeInTheDocument();
    expect(screen.getByText("Instruction-like text found in the PR")).toBeInTheDocument();
  });

  it("renders model text as plain text, not as markup", () => {
    show({ summary: "<b>bold</b> **x**", in_scope: ["<img src=x onerror=alert(1)>"] });
    renderCard();

    expect(screen.getByText("“<b>bold</b> **x**”")).toBeInTheDocument();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Intent" }).querySelector("b, img")).toBeNull();
  });

  it("shows the empty state and derives the intent on click", async () => {
    const user = userEvent.setup();
    mocks.state = { data: { intent: null }, isLoading: false, isError: false, refetch: vi.fn() };
    renderCard();

    expect(screen.getByText("Intent not derived yet")).toBeInTheDocument();
    expect(
      screen.getByText("Derive it now to check the understanding, or run a review."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Per-IP request limit")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Derive intent" }));
    expect(mocks.mutation.mutate).toHaveBeenCalledTimes(1);
  });

  it("re-runs the detection from the header button", async () => {
    const user = userEvent.setup();
    show();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Re-run intent detection" }));
    expect(mocks.mutation.mutate).toHaveBeenCalledTimes(1);
  });

  it("renders no summary while loading", () => {
    mocks.state = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    renderCard();

    expect(screen.getByRole("region", { name: "Intent" })).toBeInTheDocument();
    expect(screen.queryByText(/Add rate limiting/)).not.toBeInTheDocument();
    expect(screen.queryByText("Intent not derived yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("shows a load failure with a retry, not the empty state that invites a new derivation", async () => {
    const refetch = vi.fn();
    mocks.state = { data: undefined, isLoading: false, isError: true, refetch };
    renderCard();

    expect(screen.getByText("The intent could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByText("Intent not derived yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Derive intent" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(mocks.mutation.mutate).not.toHaveBeenCalled();
  });

  it("keeps showing a stored intent when a background refetch fails", () => {
    mocks.state = { data: { intent: RECORD }, isLoading: false, isError: true, refetch: vi.fn() };
    renderCard();
    expect(screen.getByText(/Add rate limiting to the public API/)).toBeInTheDocument();
    expect(screen.queryByText("The intent could not be loaded.")).not.toBeInTheDocument();
  });
});
