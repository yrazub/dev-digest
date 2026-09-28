import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportDraft } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const DRAFT: SkillImportDraft = {
  name: "edge-cases",
  description: "Flag tests that skip boundaries.",
  type: "rubric",
  body: "# Edge cases\n\nCheck the empty array.",
  source: "imported_file",
  ignored_files: ["edge-cases/scripts/install.sh"],
  warnings: [],
};

const importFile = vi.fn();
const create = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useImportSkillFile: () => ({
    mutate: (file: File, opts: { onSuccess: (d: SkillImportDraft) => void }) => {
      importFile(file);
      opts.onSuccess(DRAFT);
    },
    isPending: false,
  }),
  useImportSkillUrl: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSkill: () => ({ mutate: create, isPending: false }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

beforeEach(() => {
  importFile.mockClear();
  create.mockClear();
});
afterEach(cleanup);

function renderModal() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ImportSkillModal onClose={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("ImportSkillModal", () => {
  it("previews the draft with the trust notice and ignored files before saving", () => {
    renderModal();
    const file = new File(["zip"], "edge-cases.zip");
    fireEvent.change(screen.getByLabelText("choose a file"), { target: { files: [file] } });
    expect(importFile).toHaveBeenCalledWith(file);

    expect(screen.getByText(/becomes instructions in your agent's prompt/)).toBeInTheDocument();
    expect(screen.getByText("edge-cases/scripts/install.sh")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edge cases" })).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    expect(create.mock.calls[0]![0]).toEqual({
      name: "edge-cases",
      description: "Flag tests that skip boundaries.",
      type: "rubric",
      body: DRAFT.body,
      source: "imported_file",
    });
  });

  it("Back returns to the source step without saving", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("choose a file"), { target: { files: [new File(["x"], "a.md")] } });
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText(/Drop a .md or .zip here/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });
});
