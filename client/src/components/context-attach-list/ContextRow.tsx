/* ContextRow — one document of the attach list: drag handle (attached rows
   only), checkbox, path, kind badge, state notes and a Preview button. */
"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { kindBg, kindColor } from "@/lib/context-display";
import { splitPath, type AttachRow } from "./helpers";
import { s } from "./styles";

export function ContextRow({
  row,
  repoName,
  draggable,
  compact,
  onToggle,
  onPreview,
}: {
  row: AttachRow;
  repoName: string;
  /** Only attached rows, and only while no filter is applied. */
  draggable: boolean;
  /** Tighter padding and an icon-only Preview (the skill tab). */
  compact: boolean;
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
  const [hovered, setHovered] = React.useState(false);
  const { name, folder } = splitPath(path);

  return (
    <li
      ref={setNodeRef}
      style={{
        ...s.row({ attached, dragging: isDragging, hovered, compact }),
        transform: CSS.Transform.toString(transform),
        transition: transition ?? "background .12s",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
      <span style={s.pathWrap}>
        <span className="mono" style={s.name}>
          {name}
        </span>
        {folder && (
          <span className="mono" style={s.folder}>
            {folder}
          </span>
        )}
      </span>
      {doc === null && <span style={s.note}>{t("attach.notFound", { repo: repoName })}</span>}
      {doc?.status === "too_large" && <span style={s.note}>{t("attach.tooLarge")}</span>}
      {doc?.status === "unreadable" && <span style={s.note}>{t("attach.unreadable")}</span>}
      {doc && (
        <Badge color={kindColor(doc.kind)} bg={kindBg(doc.kind)} style={s.kindBadge}>
          {doc.kind}
        </Badge>
      )}
      {doc && (
        <button
          type="button"
          style={s.preview(compact)}
          aria-label={compact ? t("attach.preview") : undefined}
          title={compact ? t("attach.preview") : undefined}
          onClick={onPreview}
        >
          <Icon.Eye size={13} />
          {!compact && t("attach.preview")}
        </button>
      )}
    </li>
  );
}
