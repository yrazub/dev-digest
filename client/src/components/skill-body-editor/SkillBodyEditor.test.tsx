import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/skills.json";
import { SkillBodyEditor } from "./SkillBodyEditor";

afterEach(cleanup);

/** A real controlled parent, so typing updates the value the editor renders. */
function Harness({ initial, dirty, onChange }: { initial: string; dirty?: boolean; onChange: (v: string) => void }) {
  const [value, setValue] = React.useState(initial);
  return (
    <SkillBodyEditor
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      fileName="edge-cases"
      dirty={dirty}
    />
  );
}

function renderEditor(value: string, dirty = false) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <Harness initial={value} dirty={dirty} onChange={onChange} />
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

  it("edits in Write mode and renders markdown in Preview mode", async () => {
    const user = userEvent.setup();
    const onChange = renderEditor("# Heading");
    await user.clear(screen.getByLabelText("Skill body"));
    await user.type(screen.getByLabelText("Skill body"), "# New");
    expect(onChange).toHaveBeenLastCalledWith("# New");
    await user.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByRole("heading", { name: "New" })).toBeInTheDocument();
  });
});
