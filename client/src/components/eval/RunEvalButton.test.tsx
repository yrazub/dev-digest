import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { ApiError } from "@/lib/api";
import messages from "../../../messages/en/eval.json";

// One stable mutation object: the button reads `mutate`, `isPending`, `isError` and `error`.
const start = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as Error | null,
}));
vi.mock("@/lib/hooks/evals", () => ({ useStartEvalRun: () => start }));

import { RunEvalButton } from "./RunEvalButton";

beforeEach(() => {
  start.mutate.mockClear();
  start.isPending = false;
  start.isError = false;
  start.error = null;
});
afterEach(cleanup);

const running = { status: "running" as const, cases_done: 2, cases_total: 5 };
const done = { status: "done" as const, cases_done: 5, cases_total: 5 };

function ui(props: { caseCount: number; runs?: Array<typeof running | typeof done> }) {
  return (
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <RunEvalButton agentId="ag1" caseCount={props.caseCount} runs={props.runs ?? []} kind="secondary" />
    </NextIntlClientProvider>
  );
}

describe("RunEvalButton", () => {
  it("shows Run eval (N) and starts the run once per press", async () => {
    const user = userEvent.setup();
    render(ui({ caseCount: 3, runs: [done] }));
    const button = screen.getByRole("button", { name: "Run eval (3)" });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(start.mutate).toHaveBeenCalledTimes(1);
  });

  it("is disabled with the progress label while a run is running", async () => {
    const user = userEvent.setup();
    render(ui({ caseCount: 5, runs: [running, done] }));
    const button = screen.getByRole("button", { name: "Running… 2/5" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(start.mutate).not.toHaveBeenCalled();
  });

  it("is disabled when the agent has no case", async () => {
    const user = userEvent.setup();
    render(ui({ caseCount: 0 }));
    const button = screen.getByRole("button", { name: "Run eval (0)" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(start.mutate).not.toHaveBeenCalled();
  });

  it("is disabled while the start request is pending", () => {
    start.isPending = true;
    render(ui({ caseCount: 2 }));
    expect(screen.getByRole("button", { name: /Run eval/ })).toBeDisabled();
  });

  it("explains a missing provider key and links to the Settings page for API keys", () => {
    start.isError = true;
    start.error = new ApiError("No API key for openai. Add it in Settings.", 400, "eval_unavailable");
    render(ui({ caseCount: 2 }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No API key for openai. Add it in Settings.");
    expect(screen.getByRole("link", { name: "Add an API key in Settings" })).toHaveAttribute(
      "href",
      "/settings/api-keys",
    );
  });

  it("shows any other error as its message, without the Settings link", () => {
    start.isError = true;
    start.error = new ApiError("An eval run of this agent is already running", 409, "conflict");
    render(ui({ caseCount: 2 }));
    expect(screen.getByRole("alert")).toHaveTextContent("An eval run of this agent is already running");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    cleanup();
    start.error = new Error("Network down");
    render(ui({ caseCount: 2 }));
    expect(screen.getByRole("alert")).toHaveTextContent("Network down");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
