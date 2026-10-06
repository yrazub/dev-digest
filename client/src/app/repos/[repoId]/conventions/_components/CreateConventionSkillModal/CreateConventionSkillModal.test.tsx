import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionSkillDraft, Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import skillsMessages from "../../../../../../../messages/en/skills.json";

const DRAFT: ConventionSkillDraft = {
  name: "repo-conventions",
  description: "2 house conventions extracted from acme/api",
  type: "convention",
  body: "# repo-conventions\n\n## Naming\n",
};

const loadDraft = vi.fn();
const create = vi.fn();

vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillDraft: (_repoId: string, ids: string[]) => {
    loadDraft(ids);
    return { data: DRAFT, isError: false, refetch: vi.fn() };
  },
  useCreateConventionSkill: () => ({ mutate: create, isPending: false, error: null }),
}));

import { CreateConventionSkillModal } from "./CreateConventionSkillModal";

beforeEach(() => {
  loadDraft.mockClear();
  create.mockClear();
});
afterEach(cleanup);

function renderModal() {
  const onCreated = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages, skills: skillsMessages }}>
      <CreateConventionSkillModal
        repoId="r1"
        repoName="api"
        candidateIds={["a", "b"]}
        onCreated={onCreated}
        onClose={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
  return onCreated;
}

describe("CreateConventionSkillModal", () => {
  it("loads the draft for the accepted ids and explains where it comes from", () => {
    renderModal();
    expect(loadDraft).toHaveBeenCalledWith(["a", "b"]);
    expect(screen.getByText("Create skill from conventions")).toBeInTheDocument();
    expect(screen.getByText("2 accepted conventions")).toBeInTheDocument();
    expect(screen.getByDisplayValue("repo-conventions")).toBeInTheDocument();
    expect(screen.getByDisplayValue(DRAFT.description)).toBeInTheDocument();
  });

  it("sends the edited name, body and enabled flag with the candidate ids", async () => {
    const user = userEvent.setup();
    const onCreated = renderModal();
    const name = screen.getByDisplayValue("repo-conventions");
    await user.clear(name);
    await user.type(name, "api-house-rules");
    await user.type(screen.getByLabelText("Skill body"), "Extra rule.");
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Create skill" }));

    const [input, opts] = create.mock.calls[0]!;
    expect(input).toEqual({
      candidate_ids: ["a", "b"],
      name: "api-house-rules",
      description: DRAFT.description,
      type: "convention",
      body: `${DRAFT.body}Extra rule.`,
      enabled: false,
    });
    const skill = { id: "s1", name: "api-house-rules" } as Skill;
    (opts as { onSuccess: (s: Skill) => void }).onSuccess(skill);
    expect(onCreated).toHaveBeenCalledWith(skill);
  });

  it("an invalid name disables Create skill", async () => {
    const user = userEvent.setup();
    renderModal();
    const name = screen.getByDisplayValue("repo-conventions");
    await user.clear(name);
    await user.type(name, "Repo Conventions");
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });
});
