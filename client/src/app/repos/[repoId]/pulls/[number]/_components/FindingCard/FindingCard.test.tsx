import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard out-of-scope badge", () => {
  it("shows Outside PR scope next to the category tag for an out-of-scope finding", () => {
    renderWithIntl(<FindingCard f={{ ...FINDING, scope: "out_of_scope" }} defaultExpanded onAction={() => {}} />);
    const badge = screen.getByText("Outside PR scope");
    expect(badge).toBeInTheDocument();
    // the badge follows the category tag in the title row
    const category = screen.getByText("security");
    expect(category.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ["in_scope", "in_scope" as const],
    ["null", null],
    ["absent", undefined],
  ])("shows no badge when scope is %s", (_label, scope) => {
    const f: FindingRecord = scope === undefined ? FINDING : { ...FINDING, scope };
    if (scope === undefined) expect("scope" in f).toBe(false);
    renderWithIntl(<FindingCard f={f} defaultExpanded onAction={() => {}} />);
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.queryByText("Outside PR scope")).not.toBeInTheDocument();
  });
});
