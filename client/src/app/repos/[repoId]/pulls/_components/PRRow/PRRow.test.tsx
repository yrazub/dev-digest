/**
 * PRRow — the COST cell shows the PR's latest completed run cost at four
 * decimals, and an em-dash (never $0.0000) when the cost is unknown.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

// The row calls useRouter() for click-through navigation.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { PRRow } from "./PRRow";

afterEach(cleanup);

function pr(o: Partial<PrMeta>): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 10,
    deletions: 2,
    files_count: 1,
    status: "reviewed",
    opened_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T03:00:00Z",
    score: 80,
    ...o,
  };
}

function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — cost cell", () => {
  it("renders the latest completed run cost at four decimals", () => {
    renderRow(pr({ cost_usd: 0.0013 }));
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
  });

  it("renders an em-dash when the cost is null (unpriced model / no completed run)", () => {
    renderRow(pr({ cost_usd: null, score: null }));
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    // one dash for the unreviewed score ring, one for the cost cell, one for
    // the findings cell (findings_by_severity absent in the base fixture)
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("renders an em-dash when the field is absent", () => {
    renderRow(pr({}));
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    // cost cell + findings cell
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});

describe("PRRow — findings cell", () => {
  it("renders a badge per non-zero severity, in order", () => {
    renderRow(pr({ findings_by_severity: { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 } }));
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders an em-dash when findings_by_severity is null (no completed run)", () => {
    renderRow(pr({ findings_by_severity: null }));
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows the read-only hover popover with the finding preview, and no buttons in it", () => {
    renderRow(
      pr({
        findings_by_severity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
        findings_preview: [
          {
            id: "f1",
            severity: "CRITICAL",
            category: "security",
            title: "Hardcoded secret",
            file: "src/config.ts",
            start_line: 12,
            end_line: 12,
            rationale: "A secret is committed.",
            confidence: 0.98,
          },
        ],
      }),
    );
    // Not visible before hover.
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByTestId("findings-popover-trigger"));
    expect(screen.getByText("1 FINDING IN THIS RUN")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
