import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextList, Skill } from "@devdigest/shared";
import skillsMessages from "../../../../../messages/en/skills.json";
import contextMessages from "../../../../../messages/en/context.json";
import shellMessages from "../../../../../messages/en/shell.json";
import { SkillDetail } from "./SkillDetail";
import type { SkillTab } from "./constants";

vi.mock("@/lib/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillVersions: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false }),
}));

// One stable object per hook result: the shared list reads function identities (`refetch`, `save`).
const refetch = vi.fn();
const save = vi.fn();
const skillContextCalls: string[] = [];
const skillContext = { data: { paths: [] as string[] }, isLoading: false, isError: false, refetch };
const contextFiles = { data: undefined as ProjectContextList | undefined, isLoading: false, isError: false, refetch };
const setSkillContext = { save };

vi.mock("@/lib/hooks/context", () => ({
  useSkillContext: (skillId: string) => {
    skillContextCalls.push(skillId);
    return skillContext;
  },
  useSetSkillContext: () => setSkillContext,
  useContextFiles: () => contextFiles,
  useContextFile: () => ({ data: undefined, isLoading: false, isError: false, refetch }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", activeRepo: { id: "r1", name: "x", full_name: "acme/x" } }),
}));

beforeEach(() => {
  save.mockClear();
  refetch.mockClear();
  skillContextCalls.length = 0;
  contextFiles.data = {
    state: "ready",
    roots: ["specs", "docs", "insights"],
    documents: [{ path: "docs/a.md", kind: "docs", tokens: 100, status: "ok" }],
    total_tokens: 100,
    capped: false,
    cap: 1000,
    soft_cap_tokens: 4000,
    run_cap_tokens: 16000,
  };
});
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
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, shell: shellMessages, context: contextMessages }}>
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

  it("lists the tabs Config, Context, Preview, Versions in that order", () => {
    render(renderAt("config"));
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(names.filter((n) => ["Config", "Context", "Preview", "Versions"].includes(n))).toEqual([
      "Config",
      "Context",
      "Preview",
      "Versions",
    ]);
  });

  it("shows Project context to use on the Context tab, for this skill", () => {
    render(renderAt("context"));
    expect(screen.getByRole("heading", { name: "Project context to use" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach docs/a.md" })).toBeInTheDocument();
    expect(skillContextCalls).toContain("s1");
  });

  it("saves the skill's attached paths through the Context tab", async () => {
    const user = userEvent.setup();
    render(renderAt("context"));
    await user.click(screen.getByRole("checkbox", { name: "Attach docs/a.md" }));
    expect(save).toHaveBeenCalledWith(["docs/a.md"]);
  });
});
