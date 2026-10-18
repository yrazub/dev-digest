/* ReviewFocus — the "read these first" list. Each row is a button that opens the file at
   the line in Files changed. File and reason are model text: plain text nodes only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { elidePath } from "../../helpers";
import { s } from "./styles";

interface ReviewFocusProps {
  items: ReviewFocusItem[];
  onOpen: (file: string, line: number) => void;
}

export function ReviewFocus({ items, onOpen }: ReviewFocusProps) {
  const t = useTranslations("brief");
  // One row is hovered or focused at a time; the key is the item's index.
  const [active, setActive] = React.useState<number | null>(null);
  return (
    <section style={s.panel} aria-label={t("reviewFocus.title")}>
      <div style={s.header}>
        <Icon.ListChecks size={14} style={s.headerIcon} />
        <span style={s.title}>{t("reviewFocus.title")}</span>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p style={s.empty}>{t("reviewFocus.empty")}</p>
      ) : (
        <ul style={s.list}>
          {items.map((item, i) => (
            <li key={`${item.file}:${item.line}:${i}`}>
              <button
                type="button"
                aria-label={t("reviewFocus.open", { file: item.file, line: item.line })}
                title={`${item.file}:${item.line}`}
                style={s.row(active === i)}
                onClick={() => onOpen(item.file, item.line)}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive((cur) => (cur === i ? null : cur))}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((cur) => (cur === i ? null : cur))}
              >
                <span style={s.arrow} aria-hidden="true">
                  ▸
                </span>
                <span className="mono" style={s.path}>
                  {elidePath(item.file)}:{item.line}
                </span>
                <span style={s.reason}>— {item.reason}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
