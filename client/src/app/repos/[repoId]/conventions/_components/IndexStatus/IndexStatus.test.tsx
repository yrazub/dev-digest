import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { RepoIntelState } from "@/lib/hooks/repo-intel";
import messages from "../../../../../../../messages/en/conventions.json";

const OLD: RepoIntelState = {
  status: "full",
  filesIndexed: 312,
  filesSkipped: 0,
  lastIndexedSha: "5bc45f6a6f741f21f7e7a430146a1999cf97ec45",
  updatedAt: "2026-09-21T20:28:46.312Z",
};

let state: RepoIntelState | undefined;
const polls: boolean[] = [];
const resync = vi.fn((_v: undefined, opts: { onSuccess: () => void }) => opts.onSuccess());
const toast = { success: vi.fn(), info: vi.fn() };
// Stable like React Query's own objects, so effects that depend on them run once.
const resyncMutation = { mutate: resync, isPending: false };

vi.mock("@/lib/toast", () => ({ useToast: () => toast }));
vi.mock("@/lib/hooks/repo-intel", () => ({
  useRepoIntelStatus: (_repoId: string, poll: boolean) => {
    polls.push(poll);
    return { data: state };
  },
  useResyncRepoIntel: () => resyncMutation,
}));

import { IndexStatus } from "./IndexStatus";

function renderStatus() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }} now={new Date("2026-10-01T20:28:46.312Z")}>
      <IndexStatus repoId="r1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  state = OLD;
  polls.length = 0;
  resync.mockClear();
  toast.success.mockClear();
  toast.info.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("IndexStatus", () => {
  it("shows the indexed commit and its age", () => {
    renderStatus();
    expect(screen.getByText(/^Index: 5bc45f6 · updated /)).toBeInTheDocument();
  });

  it("says when the repo was never indexed", () => {
    state = { ...OLD, status: "degraded", lastIndexedSha: "", updatedAt: "1970-01-01T00:00:00.000Z" };
    renderStatus();
    expect(screen.getByText("Index: not indexed yet")).toBeInTheDocument();
  });

  it("Resync starts the job, polls, and reports the new commit once the index row changes", async () => {
    const user = userEvent.setup();
    const view = renderStatus();
    await user.click(screen.getByRole("button", { name: "Resync index" }));
    expect(resync).toHaveBeenCalledOnce();
    expect(polls.at(-1)).toBe(true);
    expect(screen.getByText(/Index: resyncing/)).toBeInTheDocument();

    state = { ...OLD, lastIndexedSha: "97e7a7c095f9014ce2c656e59c6cee3a1ed1d64d", updatedAt: "2026-10-01T20:28:40.000Z" };
    view.rerender(
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }} now={new Date("2026-10-01T20:28:46.312Z")}>
        <IndexStatus repoId="r1" />
      </NextIntlClientProvider>,
    );
    expect(toast.success).toHaveBeenCalledWith("Index updated to 97e7a7c. ReScan to use it.");
    expect(polls.at(-1)).toBe(false);
    expect(screen.getByText("Index: 97e7a7c · updated 6 seconds ago")).toBeInTheDocument();
  });

  it("stops waiting after the timeout when the index row never changes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderStatus();
    await user.click(screen.getByRole("button", { name: "Resync index" }));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(toast.info).toHaveBeenCalledOnce();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByText(/^Index: 5bc45f6 · updated /)).toBeInTheDocument();
  });
});
