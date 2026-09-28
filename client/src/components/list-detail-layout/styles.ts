import type { CSSProperties } from "react";

export const s = {
  frame: { display: "flex", height: "100%", minHeight: 0 } satisfies CSSProperties,
  column: {
    width: 380,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
    minHeight: 0,
  } satisfies CSSProperties,
  columnHead: { padding: "18px 16px 12px" } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    background: "none",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
    fontSize: 13,
  } satisfies CSSProperties,
  list: { flex: 1, overflow: "auto", padding: "0 12px 12px" } satisfies CSSProperties,
  detail: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
};
