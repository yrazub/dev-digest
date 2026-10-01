import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skillsMessages from "../../../../../messages/en/skills.json";
import shellMessages from "../../../../../messages/en/shell.json";
import { SkillDetail } from "./SkillDetail";
import type { SkillTab } from "./constants";

vi.mock("@/lib/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillVersions: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false }),
}));

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "edge-cases",
  description: "Flag missing boundaries.",
  type: "rubric",
  source: "manual",
  body: "# Saved body",
  enabled: true,
  version: 1,
  evidence_files: null,
  agent_count: 0,
  created_at: "2026-09-28T00:00:00.000Z",
};

function renderAt(tab: SkillTab) {
  return (
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, shell: shellMessages }}>
      <SkillDetail skill={SKILL} tab={tab} onTab={vi.fn()} onDelete={vi.fn()} />
    </NextIntlClientProvider>
  );
}

describe("SkillDetail", () => {
  it("keeps unsaved Config edits across a trip to another tab", async () => {
    const user = userEvent.setup();
    const { rerender } = render(renderAt("config"));
    await user.clear(screen.getByLabelText("Skill body"));
    await user.type(screen.getByLabelText("Skill body"), "# Draft body");

    rerender(renderAt("preview"));
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();

    rerender(renderAt("config"));
    expect(screen.getByLabelText("Skill body")).toHaveValue("# Draft body");
  });
});
