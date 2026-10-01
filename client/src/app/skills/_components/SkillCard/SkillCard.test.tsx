import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "breaking-change",
  description: "Flag removed or renamed response fields.",
  type: "rubric",
  source: "imported_file",
  body: "# Rule",
  enabled: true,
  version: 3,
  evidence_files: null,
  agent_count: 2,
  created_at: "2026-09-28T00:00:00.000Z",
};

function renderCard(props: Partial<React.ComponentProps<typeof SkillCard>> = {}) {
  const handlers = { onSelect: vi.fn(), onToggle: vi.fn(), onDelete: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillCard skill={SKILL} {...handlers} {...props} />
    </NextIntlClientProvider>,
  );
  return handlers;
}

describe("SkillCard", () => {
  it("shows name, description, type, source, version and agent count", () => {
    renderCard();
    expect(screen.getByText("breaking-change")).toBeInTheDocument();
    expect(screen.getByText("Flag removed or renamed response fields.")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
  });

  it("delete asks the parent to confirm and does not select the card", async () => {
    const user = userEvent.setup();
    const h = renderCard();
    await user.click(screen.getByRole("button", { name: "Delete skill" }));
    expect(h.onDelete).toHaveBeenCalledOnce();
    expect(h.onSelect).not.toHaveBeenCalled();
  });

  it("clicking the card selects it", async () => {
    const user = userEvent.setup();
    const h = renderCard();
    await user.click(screen.getByText("breaking-change"));
    expect(h.onSelect).toHaveBeenCalledOnce();
  });
});
