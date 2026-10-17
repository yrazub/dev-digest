/* ContextRow — one document of the attach list: drag handle (attached rows
   only), checkbox, path, kind badge, state notes and a Preview button. */
"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import { kindColor } from "@/lib/context-display";
import type { AttachRow } from "./helpers";
import { s } from "./styles";

export function ContextRow({
  row,
  repoName,
  draggable,
  onToggle,
  onPreview,
}: {
  row: AttachRow;
  repoName: string;
  /** Only attached rows, and only while no filter is applied. */
  draggable: boolean;
  onToggle: (on: boolean) => void;
  onPreview: () => void;
}) {
  const t = useTranslations("context");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.path,
    disabled: !draggable,
  });
  const { doc, path, attached } = row;
  const unusable = doc !== null && doc.status !== "ok";

  return (
    <li
      ref={setNodeRef}
      style={{ ...s.row(attached, isDragging), transform: CSS.Transform.toString(transform), transition }}
    >
      {draggable ? (
        <button
          type="button"
          aria-label={t("attach.dragHandle", { path })}
          style={s.handle}
          {...attributes}
          {...listeners}
        >
          <Icon.Menu size={14} />
        </button>
      ) : (
        <span style={s.handleSpace} aria-hidden />
      )}
      <input
        type="checkbox"
        style={s.checkbox}
        checked={attached}
        disabled={unusable && !attached}
        aria-label={t("attach.checkbox", { path })}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className="mono" style={s.path}>
        {path}
      </span>
      {doc === null && <span style={s.note}>{t("attach.notFound", { repo: repoName })}</span>}
      {doc?.status === "too_large" && <span style={s.note}>{t("attach.tooLarge")}</span>}
      {doc?.status === "unreadable" && <span style={s.note}>{t("attach.unreadable")}</span>}
      {doc && <Badge color={kindColor(doc.kind)}>{doc.kind}</Badge>}
      {doc && (
        <Button size="sm" onClick={onPreview}>
          {t("attach.preview")}
        </Button>
      )}
    </li>
  );
}
