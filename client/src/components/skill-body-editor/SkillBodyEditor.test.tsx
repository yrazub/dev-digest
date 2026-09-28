import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/skills.json";
import { SkillBodyEditor } from "./SkillBodyEditor";

afterEach(cleanup);

function renderEditor(value: string, dirty = false) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillBodyEditor value={value} onChange={onChange} fileName="edge-cases" dirty={dirty} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

describe("SkillBodyEditor", () => {
  it("shows the file name, an approximate token count and the unsaved marker", () => {
    renderEditor("12345678", true);
    expect(screen.getByText("edge-cases.md")).toBeInTheDocument();
    expect(screen.getByText("~2 tokens")).toBeInTheDocument();
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("edits in Write mode and renders markdown in Preview mode", () => {
    const onChange = renderEditor("# Heading");
    fireEvent.change(screen.getByLabelText("Skill body"), { target: { value: "# New" } });
    expect(onChange).toHaveBeenCalledWith("# New");
    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument();
  });
});
