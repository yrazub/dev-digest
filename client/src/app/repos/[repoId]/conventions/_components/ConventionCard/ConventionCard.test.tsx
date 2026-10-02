import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";

vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn() }) }));

import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "error-handling",
  rule: "Throw NotFoundError when a lookup misses.",
  evidence_path: "src/users/service.ts",
  evidence_line_start: 23,
  evidence_line_end: 31,
  evidence_snippet: "if (!user) throw new NotFoundError('User not found');",
  evidence_url: "https://github.com/acme/api/blob/abc123/src/users/service.ts#L23-L31",
  confidence: 0.91,
  status: "pending",
};

function renderCard(candidate: Partial<ConventionCandidate> = {}) {
  const handlers = { onToggleAccept: vi.fn(), onReject: vi.fn(), onRestore: vi.fn(), onSave: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard candidate={{ ...CANDIDATE, ...candidate }} {...handlers} />
    </NextIntlClientProvider>,
  );
  return handlers;
}

describe("ConventionCard", () => {
  it("shows the rule, category, evidence link with its range, snippet and confidence", () => {
    renderCard();
    expect(screen.getByText("Throw NotFoundError when a lookup misses.")).toBeInTheDocument();
    expect(screen.getByText("error handling")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /src\/users\/service\.ts:23-31/ });
    expect(link).toHaveAttribute("href", CANDIDATE.evidence_url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText(CANDIDATE.evidence_snippet)).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
  });

  it("a one-line range shows path:line, and no link without an indexed sha", () => {
    renderCard({ evidence_line_end: 23, evidence_url: null });
    expect(screen.getByText("src/users/service.ts:23")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("Accept, Reject; an accepted card reads Accepted", async () => {
    const user = userEvent.setup();
    const h = renderCard();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(h.onToggleAccept).toHaveBeenCalledOnce();
    expect(h.onReject).toHaveBeenCalledOnce();
    cleanup();
    renderCard({ status: "accepted" });
    expect(screen.getByRole("button", { name: "Accepted" })).toBeInTheDocument();
  });

  it("Edit changes the rule and category in place; Save sends them", async () => {
    const user = userEvent.setup();
    const h = renderCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const rule = screen.getByPlaceholderText("Rule");
    await user.clear(rule);
    await user.type(rule, "Throw NotFoundError on a missed lookup.");
    await user.selectOptions(screen.getByRole("combobox"), "naming");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(h.onSave).toHaveBeenCalledWith({ rule: "Throw NotFoundError on a missed lookup.", category: "naming" });
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("Cancel leaves the rule as it was, and an empty rule cannot be saved", async () => {
    const user = userEvent.setup();
    const h = renderCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByPlaceholderText("Rule"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.onSave).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });

  it("a rejected card offers Restore only", async () => {
    const user = userEvent.setup();
    const h = renderCard({ status: "rejected" });
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(h.onRestore).toHaveBeenCalledOnce();
  });
});
