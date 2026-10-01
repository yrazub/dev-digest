import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";

afterEach(cleanup);

function renderModal() {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ConfirmDeleteModal
      title="Delete skill"
      body="Delete “x”?"
      cancelLabel="Cancel"
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onClose={onClose}
    />,
  );
  return { onConfirm, onClose };
}

describe("ConfirmDeleteModal", () => {
  it("confirms, cancels and closes with the ✕", async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
