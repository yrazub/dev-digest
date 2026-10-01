/* ConfirmDeleteModal — confirm / cancel / ✕ before an irreversible delete.
   Shared by skills and agents; the caller passes translated strings. */
"use client";

import React from "react";
import { Button, Modal } from "@devdigest/ui";

export function ConfirmDeleteModal({
  title,
  body,
  cancelLabel,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  body: React.ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      width={440}
      title={title}
      onClose={pending ? undefined : onClose}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button kind="secondary" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button kind="danger" icon="Trash" onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={{ padding: 24, fontSize: 13.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>{body}</div>
    </Modal>
  );
}
