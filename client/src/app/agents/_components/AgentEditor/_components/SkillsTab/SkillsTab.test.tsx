import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { AgentSkill } from "@devdigest/shared";
import agentsMessages from "../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../messages/en/skills.json";
import { linkedIds, moveLinked, toggleLinked } from "./helpers";

const setLinks = vi.fn();
const skill = (name: string, linked: boolean, order: number | null, enabled = true): AgentSkill => ({
  id: `id-${name}`,
  name,
  description: "d",
  type: "rubric",
  source: "manual",
  body: "b",
  enabled,
  version: 1,
  evidence_files: null,
  agent_count: 0,
  created_at: "2026-09-28T00:00:00.000Z",
  linked,
  order,
});
let SKILLS: AgentSkill[] = [];

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/hooks/agents", () => ({
  useAgentSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate: setLinks }),
}));

import { SkillsTab } from "./SkillsTab";

beforeEach(() => {
  setLinks.mockClear();
  SKILLS = [
    skill("branch-coverage", true, 0),
    skill("edge-cases", true, 1),
    skill("semver-discipline", false, null, false),
  ];
});
afterEach(cleanup);

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentsMessages, skills: skillsMessages }}>
      <SkillsTab agentId="ag1" />
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab", () => {
  it("lists every skill, linked first, with the K of N badge", () => {
    renderTab();
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    const rows = screen.getAllByTestId(/^skill-row-/).map((r) => r.dataset.testid);
    expect(rows).toEqual(["skill-row-branch-coverage", "skill-row-edge-cases", "skill-row-semver-discipline"]);
    expect(screen.getByText(/disabled globally/)).toBeInTheDocument();
  });

  it("only checked rows have a drag handle (#31)", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "Drag branch-coverage to reorder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drag edge-cases to reorder" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Drag semver-discipline to reorder" })).toBeNull();
  });

  it("checking appends to the prompt order; unchecking removes", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole("checkbox", { name: "semver-discipline" }));
    expect(setLinks).toHaveBeenLastCalledWith(["id-branch-coverage", "id-edge-cases", "id-semver-discipline"]);
    await user.click(screen.getByRole("checkbox", { name: "branch-coverage" }));
    expect(setLinks).toHaveBeenLastCalledWith(["id-edge-cases"]);
  });

  it("filtering narrows the list and turns off dragging (#30)", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.clear(screen.getByLabelText("Filter skills…"));
    await user.type(screen.getByLabelText("Filter skills…"), "edge");
    expect(screen.getAllByTestId(/^skill-row-/)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Drag / })).toBeNull();
    expect(screen.getByText("Clear the filter to reorder.")).toBeInTheDocument();
  });
});

describe("SkillsTab helpers", () => {
  it("reads linked ids in order and moves one", () => {
    const ids = linkedIds([skill("b", true, 1), skill("a", true, 0), skill("c", false, null)]);
    expect(ids).toEqual(["id-a", "id-b"]);
    expect(moveLinked(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"]);
    expect(moveLinked(["a", "b"], "a", "x")).toEqual(["a", "b"]);
    expect(toggleLinked(["a"], "a", true)).toEqual(["a"]);
  });
});
