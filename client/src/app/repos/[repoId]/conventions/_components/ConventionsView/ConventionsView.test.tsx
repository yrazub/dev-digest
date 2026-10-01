import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionList } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";

const extract = vi.fn();
const update = vi.fn();
let list: ConventionList | undefined;

vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>repo not found</div> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { name: "api", full_name: "acme/api" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn() }) }));
vi.mock("../CreateConventionSkillModal", () => ({
  CreateConventionSkillModal: ({ candidateIds }: { candidateIds: string[] }) => (
    <div>create modal for {candidateIds.join(",")}</div>
  ),
}));
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ data: list, isLoading: false, isError: false, refetch: vi.fn() }),
  useExtractConventions: () => ({ mutate: extract, isPending: false, data: undefined }),
  useUpdateConvention: () => ({ mutate: update }),
}));

import { ConventionsView } from "./ConventionsView";

function candidate(id: string, status: ConventionCandidate["status"]): ConventionCandidate {
  return {
    id,
    category: "naming",
    rule: `Rule ${id}`,
    evidence_path: "src/a.ts",
    evidence_line_start: 1,
    evidence_line_end: 1,
    evidence_snippet: `const ${id} = 1;`,
    evidence_url: null,
    confidence: 0.8,
    status,
  };
}

const SCANNED = { last_scan_at: "2026-10-01T10:00:00.000Z", sampled_files: 14 };

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }} now={new Date("2026-10-01T11:00:00.000Z")}>
      <ConventionsView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  extract.mockClear();
  update.mockClear();
});
afterEach(cleanup);

describe("ConventionsView", () => {
  it("empty repo: Run Scan, no ReScan, no Create skill", async () => {
    list = { scan: { last_scan_at: null, sampled_files: null }, candidates: [] };
    const user = userEvent.setup();
    renderView();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ReScan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Create skill" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Run Scan" }));
    expect(extract).toHaveBeenCalledOnce();
  });

  it("after a scan: ReScan in the header, scan info, rejected hidden, K of N accepted", async () => {
    list = { scan: SCANNED, candidates: [candidate("a", "accepted"), candidate("b", "pending"), candidate("c", "rejected")] };
    const user = userEvent.setup();
    renderView();
    expect(screen.queryByRole("button", { name: "Run Scan" })).toBeNull();
    expect(screen.getByText("Detected from 14 sample files · last scan 1 hour ago")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
    expect(screen.getByText("Rule a")).toBeInTheDocument();
    expect(screen.queryByText("Rule c")).toBeNull();

    await user.click(screen.getByRole("button", { name: "ReScan" }));
    expect(extract).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Show rejected (1)" }));
    expect(screen.getByText("Rule c")).toBeInTheDocument();
  });

  it("Create skill appears only once a candidate is accepted, and opens with the accepted ids", async () => {
    list = { scan: SCANNED, candidates: [candidate("b", "pending")] };
    renderView();
    expect(screen.queryByRole("button", { name: "Create skill" })).toBeNull();
    cleanup();

    list = { scan: SCANNED, candidates: [candidate("a", "accepted"), candidate("b", "pending"), candidate("d", "accepted")] };
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByText("create modal for a,d")).toBeInTheDocument();
  });

  it("card actions patch the candidate; Deselect all returns accepted ones to pending", async () => {
    list = { scan: SCANNED, candidates: [candidate("a", "accepted"), candidate("b", "pending")] };
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(update).toHaveBeenLastCalledWith({ id: "b", patch: { status: "accepted" } });
    await user.click(screen.getAllByRole("button", { name: "Reject" })[0]!);
    expect(update).toHaveBeenLastCalledWith({ id: "a", patch: { status: "rejected" } });
    await user.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(update).toHaveBeenLastCalledWith({ id: "a", patch: { status: "pending" } });
  });
});
