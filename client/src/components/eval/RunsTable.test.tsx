import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSuiteRun, EvalSuiteRunStatus } from "@devdigest/shared";
import messages from "../../../messages/en/eval.json";
import { RunsTable } from "./RunsTable";

function run(id: string, status: EvalSuiteRunStatus, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun {
  return {
    id,
    agent_id: "a1",
    agent_name: "Security Reviewer",
    status,
    config: { agent_version: 3, system_prompt: "p", provider: "openai", model: "m", strategy: "single-pass", skills: [] },
    recall: null,
    precision: null,
    citation_accuracy: null,
    cases_total: 4,
    cases_done: 0,
    cases_passed: 0,
    cases_errored: 0,
    cost_usd: null,
    // local-time instant, so the label does not depend on the machine's timezone
    started_at: new Date(2026, 9, 30, 10, 0).toISOString(),
    finished_at: null,
    error: null,
    ...over,
  } as EvalSuiteRun;
}

const DONE = run("done1", "done", {
  recall: 0.75,
  precision: 0.5,
  citation_accuracy: 1,
  cases_done: 4,
  cases_passed: 3,
  cost_usd: 0.004,
  started_at: new Date(2026, 9, 30, 10, 0).toISOString(),
});
const RUNNING = run("run1", "running", { cases_done: 1, started_at: new Date(2026, 9, 30, 11, 0).toISOString() });
const FAILED = run("fail1", "failed", {
  error: "All 4 cases failed: No API key for openai. Add it in Settings.",
  started_at: new Date(2026, 9, 30, 12, 0).toISOString(),
});
const ERRORED = run("err1", "done", {
  recall: 0.5,
  precision: 0.5,
  citation_accuracy: 0.5,
  cases_done: 4,
  cases_passed: 2,
  cases_errored: 1,
  started_at: new Date(2026, 9, 30, 13, 0).toISOString(),
});

function renderTable(props: Partial<React.ComponentProps<typeof RunsTable>> = {}) {
  const onOpen = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <RunsTable runs={[DONE, RUNNING, FAILED, ERRORED]} onOpen={onOpen} {...props} />
    </NextIntlClientProvider>,
  );
  return { onOpen };
}

describe("RunsTable rows", () => {
  it("renders a done row's metrics, pass count and cost, and a running row's progress", () => {
    renderTable();
    const rows = screen.getAllByRole("button");
    expect(rows).toHaveLength(4);

    const done = rows[0]!;
    expect(within(done).getByText("75%")).toBeInTheDocument();
    expect(within(done).getByText("50%")).toBeInTheDocument();
    expect(within(done).getByText("100%")).toBeInTheDocument();
    expect(within(done).getByText("3/4")).toBeInTheDocument();
    expect(within(done).getByText("$0.0040")).toBeInTheDocument();
    expect(within(done).getByText("v3")).toBeInTheDocument();

    const running = rows[1]!;
    expect(within(running).getByText("Running… 1/4")).toBeInTheDocument();
    expect(within(running).queryByText(/%/)).not.toBeInTheDocument();
    // the pass cell and the unknown cost are both em-dashes, never $0.0000
    expect(within(running).getAllByText("—")).toHaveLength(2);
    expect(within(running).queryByText("$0.0000")).not.toBeInTheDocument();
  });

  it("shows a failed run's error text in place of the metrics, with the text as its title", () => {
    renderTable();
    const failed = screen.getAllByRole("button")[2]!;
    const error = within(failed).getByText(/All 4 cases failed: No API key for openai/);
    expect(error).toHaveAttribute("title", FAILED.error);
    expect(within(failed).queryByText(/%/)).not.toBeInTheDocument();
  });

  it("shows how many cases errored under the pass cell of a done run, and only then", () => {
    renderTable();
    const rows = screen.getAllByRole("button");
    expect(within(rows[3]!).getByText("1 of 4 cases errored")).toBeInTheDocument();
    expect(within(rows[0]!).queryByText(/cases errored/)).not.toBeInTheDocument();
  });

  it("puts a status chip in the version cell when there is no selection, and none with one", () => {
    const { onOpen } = renderTable();
    expect(onOpen).not.toHaveBeenCalled();
    const done = screen.getAllByRole("button")[0]!;
    expect(within(done).getByText("done")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("puts the full ran-at time in a title so a clipped cell stays readable", () => {
    renderTable();
    expect(screen.getAllByText("2026-10-30 10:00")[0]).toHaveAttribute("title", "2026-10-30 10:00");
  });

  it("renders run text as literal text, never as markup", () => {
    const hostile = run("h1", "failed", { error: "<b>boom</b>" });
    renderTable({ runs: [hostile] });
    expect(screen.getByText("<b>boom</b>")).toBeInTheDocument();
    expect(screen.queryByText("boom", { selector: "b" })).not.toBeInTheDocument();
  });
});

describe("RunsTable selection and opening", () => {
  it("names each checkbox by its time and version and disables failed and running runs", () => {
    renderTable({ selection: { selected: ["done1"], onToggle: vi.fn() } });

    const done = screen.getByRole("checkbox", { name: "2026-10-30 10:00 · v3" });
    expect(done).toBeEnabled();
    expect(done).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "2026-10-30 11:00 · v3" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "2026-10-30 12:00 · v3" })).toBeDisabled();
    const errored = screen.getByRole("checkbox", { name: "2026-10-30 13:00 · v3" });
    expect(errored).toBeEnabled();
    expect(errored).not.toBeChecked();
    // with a checkbox column the failed row carries the word "failed" before its error
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("a checkbox click toggles the run and does not open the row", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { onOpen } = renderTable({ selection: { selected: [], onToggle } });

    await user.click(screen.getByRole("checkbox", { name: "2026-10-30 10:00 · v3" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("done1");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("a click on a disabled checkbox toggles nothing", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderTable({ selection: { selected: [], onToggle } });

    await user.click(screen.getByRole("checkbox", { name: "2026-10-30 12:00 · v3" }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("a row click opens the run with the row element", async () => {
    const user = userEvent.setup();
    const { onOpen } = renderTable();

    await user.click(within(screen.getAllByRole("button")[0]!).getByText("3/4"));

    expect(onOpen).toHaveBeenCalledTimes(1);
    const [opened, el] = onOpen.mock.calls[0] as [EvalSuiteRun, HTMLElement];
    expect(opened.id).toBe("done1");
    expect(el).toBe(screen.getAllByRole("button")[0]);
  });

  it("Enter and Space on a focused row open it", async () => {
    const user = userEvent.setup();
    const { onOpen } = renderTable();

    await user.tab();
    expect(screen.getAllByRole("button")[0]).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect((onOpen.mock.calls[1] as [EvalSuiteRun])[0].id).toBe("done1");
  });

  it("Space and Enter on the checkbox belong to the checkbox: the row does not open", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { onOpen } = renderTable({ selection: { selected: [], onToggle } });

    screen.getByRole("checkbox", { name: "2026-10-30 10:00 · v3" }).focus();
    await user.keyboard(" ");
    await user.keyboard("{Enter}");

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
