import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord } from "@devdigest/shared";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import { InlineFinding } from "./InlineFinding";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  rationale: "A secret is committed in source.",
  suggestion: null,
  confidence: 0.95,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function mockFetch() {
  const fn = vi.fn(async () => new Response(JSON.stringify({ finding: FINDING }), { status: 200 }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview }}>
        <InlineFinding finding={FINDING} prId="pr1" repoFullName="acme/api" headSha="abc123" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { invalidate };
}

describe("InlineFinding", () => {
  it("starts open, with title, rationale and the two actions", () => {
    mockFetch();
    renderCard();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("A secret is committed in source.")).toBeInTheDocument();
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Dismiss")).toBeInTheDocument();
  });

  it("Dismiss posts to /findings/<id>/dismiss and refreshes the PR's reviews", async () => {
    const fetch = mockFetch();
    const user = userEvent.setup();
    const { invalidate } = renderCard();

    await user.click(screen.getByText("Dismiss"));

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reviews", "pr1"] }));
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/findings\/f1\/dismiss$/);
    expect(init.method).toBe("POST");
  });

  it("Dismiss also invalidates the PR's smart-diff queries, so the group marks follow (C4)", async () => {
    mockFetch();
    const user = userEvent.setup();
    const { invalidate } = renderCard();

    await user.click(screen.getByText("Dismiss"));

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["smart-diff", "pr1"] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reviews", "pr1"] });
  });

  it("Accept posts to /findings/<id>/accept", async () => {
    const fetch = mockFetch();
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByText("Accept"));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/findings\/f1\/accept$/);
    expect(init.method).toBe("POST");
  });

  it("a click on the card's header hides the rationale and leaves the title (C2)", async () => {
    mockFetch();
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByText("Hardcoded secret"));

    expect(screen.queryByText("A secret is committed in source.")).not.toBeInTheDocument();
    expect(screen.queryByText("Accept")).not.toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });
});
