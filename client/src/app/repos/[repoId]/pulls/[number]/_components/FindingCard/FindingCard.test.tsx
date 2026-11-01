import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCaseRecord, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

const AGENT = "a1";
const EVALS_HREF = `/agents/${AGENT}?tab=evals`;
const ACCEPTED: FindingRecord = { ...FINDING, accepted_at: "2026-10-04T00:00:00Z" };
const DISMISSED: FindingRecord = { ...FINDING, dismissed_at: "2026-10-04T00:00:00Z" };

function evalCase(kind: "must_find" | "must_not_flag", sourceFindingId: string | null): EvalCaseRecord {
  return {
    id: "c1",
    owner_kind: "agent",
    owner_id: AGENT,
    name: "Hardcoded Stripe secret key",
    input_diff: "diff --git a/src/config.ts b/src/config.ts",
    input_files: ["src/config.ts"],
    input_meta: {
      pr_id: "pr1",
      pr_number: 482,
      repo: "acme/api",
      pr_title: "Add rate limiting",
      pr_body: null,
      pr_author: "octocat",
      head_sha: "abc123",
    },
    expected_output: {
      kind,
      file: "src/config.ts",
      start_line: 11,
      end_line: 11,
      title: "Hardcoded Stripe secret key",
      severity: "CRITICAL",
      category: "security",
    },
    notes: null,
    source_finding_id: sourceFindingId,
    created_at: "2026-10-04T00:00:00Z",
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Routes the two eval requests the card makes: the agent's case list and the case creation. */
function mockApi(opts: {
  cases?: EvalCaseRecord[];
  create?: () => Promise<Response> | Response;
}) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST" && /\/findings\/[^/]+\/eval-case$/.test(url)) {
      return opts.create ? opts.create() : json({ case: evalCase("must_find", "f1"), created: true }, 201);
    }
    if (/\/agents\/[^/]+\/eval-cases$/.test(url)) return json({ cases: opts.cases ?? [] });
    return json({}, 404);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} agentId={null} />
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
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} agentId={null} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard out-of-scope badge", () => {
  it("shows Outside PR scope next to the category tag for an out-of-scope finding", () => {
    renderWithIntl(<FindingCard f={{ ...FINDING, scope: "out_of_scope" }} defaultExpanded onAction={() => {}} agentId={null} />);
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
    renderWithIntl(<FindingCard f={f} defaultExpanded onAction={() => {}} agentId={null} />);
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
    expect(screen.queryByText("Outside PR scope")).not.toBeInTheDocument();
  });
});

describe("FindingCard — Turn into eval case", () => {
  const cardOf = (f: FindingRecord, agentId: string | null = AGENT) =>
    renderWithIntl(<FindingCard f={f} defaultExpanded onAction={() => {}} agentId={agentId} />);
  const evalButton = () => screen.getByRole("button", { name: "Turn into eval case" });

  it("offers an enabled button on an accepted and on a dismissed card, each with its own hint", () => {
    mockApi({});
    cardOf(ACCEPTED);
    expect(evalButton()).toBeEnabled();
    expect(evalButton()).toHaveAttribute("title", "Create a 'must find' eval case from this finding");
    cleanup();

    cardOf(DISMISSED);
    expect(evalButton()).toBeEnabled();
    expect(evalButton()).toHaveAttribute("title", "Create a 'must NOT comment' eval case from this dismissal");
  });

  it("disables the button on an open card and says why, as a tooltip and as the accessible description", () => {
    mockApi({});
    cardOf(FINDING);
    expect(evalButton()).toBeDisabled();
    expect(evalButton()).toHaveAccessibleDescription("Accept or dismiss the finding first");
    expect(screen.getByTitle("Accept or dismiss the finding first")).toBeInTheDocument();
  });

  it("disables the button for a finding without an agent, and the no-agent reason wins over the open one", () => {
    const fetch = mockApi({});
    cardOf(ACCEPTED, null);
    expect(evalButton()).toBeDisabled();
    expect(evalButton()).toHaveAccessibleDescription("No agent for this finding");
    expect(screen.getByTitle("No agent for this finding")).toBeInTheDocument();
    cleanup();

    cardOf(FINDING, null);
    expect(evalButton()).toHaveAccessibleDescription("No agent for this finding");
    // with no agent there is no case list to read
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates the case on click, then shows the saved line and a link to the Evals tab without navigating", async () => {
    const user = userEvent.setup();
    const fetch = mockApi({});
    cardOf(ACCEPTED);

    await user.click(evalButton());

    expect(await screen.findByText("Saved as must find")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "View in Evals" });
    expect(link).toHaveAttribute("href", EVALS_HREF);
    expect(screen.queryByRole("button", { name: "Turn into eval case" })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST") as unknown as [string, RequestInit];
    expect(post[0]).toMatch(/\/findings\/f1\/eval-case$/);
  });

  it("names the saved kind from the created case: a dismissed finding is saved as must not flag", async () => {
    const user = userEvent.setup();
    mockApi({ create: () => json({ case: evalCase("must_not_flag", "f1"), created: true }, 201) });
    cardOf(DISMISSED);

    await user.click(evalButton());

    expect(await screen.findByText("Saved as must not flag")).toBeInTheDocument();
  });

  it("disables the button while the request is pending", async () => {
    const user = userEvent.setup();
    let release: (r: Response) => void = () => {};
    const gate = new Promise<Response>((resolve) => (release = resolve));
    mockApi({ create: () => gate });
    cardOf(ACCEPTED);

    await user.click(evalButton());

    await waitFor(() => expect(evalButton()).toBeDisabled());
    expect(screen.queryByText("Saved as must find")).not.toBeInTheDocument();

    release(json({ case: evalCase("must_find", "f1"), created: true }, 201));
    expect(await screen.findByText("Saved as must find")).toBeInTheDocument();
  });

  it("shows the API's message in a status line and keeps the button for another try when the request fails", async () => {
    const user = userEvent.setup();
    mockApi({
      create: () => json({ error: { code: "no_diff", message: "No diff available for src/config.ts" } }, 422),
    });
    cardOf(ACCEPTED);

    await user.click(evalButton());

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("No diff available for src/config.ts");
    expect(evalButton()).toBeEnabled();
    expect(screen.queryByText(/Saved as/)).not.toBeInTheDocument();
  });

  it("shows In eval set and the Evals link, and no button, when a case already comes from this finding", async () => {
    mockApi({ cases: [evalCase("must_find", "f1")] });
    cardOf(ACCEPTED);

    expect(await screen.findByText("In eval set")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View in Evals" })).toHaveAttribute("href", EVALS_HREF);
    expect(screen.queryByRole("button", { name: "Turn into eval case" })).not.toBeInTheDocument();
  });

  it("keeps the button when the agent's cases come from other findings", async () => {
    const fetch = mockApi({ cases: [evalCase("must_find", "other")] });
    cardOf(ACCEPTED);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(evalButton()).toBeEnabled();
    expect(screen.queryByText("In eval set")).not.toBeInTheDocument();
  });
});
