import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import skillsMessages from "../../../../../../../messages/en/skills.json";
import shellMessages from "../../../../../../../messages/en/shell.json";

const restore = vi.fn();
const VERSIONS: SkillVersion[] = [
  { version: 2, body: "line one\nline two changed\n", note: "Tightened", created_at: "2026-09-28T00:00:00.000Z", current: true },
  { version: 1, body: "line one\nline two\n", note: null, created_at: "2026-09-27T00:00:00.000Z", current: false },
];

vi.mock("@/lib/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: restore, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(cleanup);

const SKILL = { id: "s1", name: "edge-cases", body: VERSIONS[0]!.body, version: 2 } as Skill;

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, shell: shellMessages }}>
      <VersionsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab", () => {
  it("lists versions newest first with the current one badged", () => {
    renderTab();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Tightened")).toBeInTheDocument();
    expect(screen.getByText("No note")).toBeInTheDocument();
    // Only the older version can be diffed or restored.
    expect(screen.getAllByRole("button", { name: "Diff" })).toHaveLength(1);
  });

  it("Diff shows the change against the current body", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Diff" }));
    expect(screen.getByText("line two changed")).toBeInTheDocument();
    expect(screen.getByText("line two")).toBeInTheDocument();
  });

  it("Restore asks for confirmation, then restores that version", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    const dialog = screen.getByRole("dialog");
    expect(restore).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(restore.mock.calls[0]![0]).toEqual({ id: "s1", version: 1 });
  });
});
