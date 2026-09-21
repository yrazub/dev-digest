/**
 * PRRow — the COST cell shows the PR's latest completed run cost at four
 * decimals, and an em-dash (never $0.0000) when the cost is unknown.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
    // one dash for the unreviewed score ring, one for the cost cell
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("renders an em-dash when the field is absent", () => {
    renderRow(pr({}));
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });
});
