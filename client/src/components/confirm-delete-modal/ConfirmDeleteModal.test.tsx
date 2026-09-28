import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
  it("confirms, cancels and closes with the ✕", () => {
    const { onConfirm, onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
