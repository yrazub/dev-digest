/* ListDetailLayout — the SKILLS LAB list + detail frame (design: Skill Editor,
   Agent Editor). A fixed left column (title, primary action, search, list) and a
   detail pane on the right. The route decides what the pane shows, so the pane
   is both a side panel and a page with its own URL. */
"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "./styles";

export function ListDetailLayout({
  title,
  action,
  search,
  onSearch,
  searchPlaceholder,
  list,
  children,
}: {
  title: string;
  /** Primary action next to the title (e.g. an "Add" dropdown). */
  action?: React.ReactNode;
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder: string;
  list: React.ReactNode;
  /** The detail pane. */
  children: React.ReactNode;
}) {
  return (
    <div style={s.frame}>
      <aside style={s.column}>
        <div style={s.columnHead}>
          <div style={s.titleRow}>
            <h1 style={s.title}>{title}</h1>
            {action}
          </div>
          <label style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              style={s.searchInput}
            />
          </label>
        </div>
        <div style={s.list}>{list}</div>
      </aside>
      <section style={s.detail}>{children}</section>
    </div>
  );
}
