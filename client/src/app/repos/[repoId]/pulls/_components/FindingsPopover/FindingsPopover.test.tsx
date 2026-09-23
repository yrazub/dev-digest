/**
 * FindingsPopover — the PR-list FINDINGS cell. Read-only: shows per-severity
 * badges always, and a finding preview only on hover, with no buttons.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Finding } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { FindingsPopover } from "./FindingsPopover";

afterEach(cleanup);

const PREVIEW: Finding[] = [
  {
    id: "f1",
    severity: "WARNING",
    category: "perf",
    title: "N+1 query in user list endpoint",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "Loop issues one query per user.",
    confidence: 0.86,
  },
];

function renderPopover(p: Partial<Parameters<typeof FindingsPopover>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsPopover findingsBySeverity={null} findingsPreview={null} {...p} />
    </NextIntlClientProvider>,
  );
}

describe("FindingsPopover", () => {
  it("renders an em-dash when there is nothing to show", () => {
    renderPopover();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders badges without opening the popover", () => {
    renderPopover({ findingsBySeverity: { CRITICAL: 0, WARNING: 1, SUGGESTION: 0 } });
    expect(screen.queryByText(/FINDING/)).not.toBeInTheDocument();
  });

  it("opens a read-only preview on hover and closes on mouse-leave", () => {
    renderPopover({
      findingsBySeverity: { CRITICAL: 0, WARNING: 1, SUGGESTION: 0 },
      findingsPreview: PREVIEW,
    });
    const trigger = screen.getByTestId("findings-popover-trigger");

    fireEvent.mouseEnter(trigger);
    expect(screen.getByText("1 FINDING IN THIS RUN")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:45-52")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByText("N+1 query in user list endpoint")).not.toBeInTheDocument();
  });
});
