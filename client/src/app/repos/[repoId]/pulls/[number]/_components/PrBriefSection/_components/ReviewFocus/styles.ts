import type { CSSProperties } from "react";

/** Co-located styles for ReviewFocus. CSS variables only. */
export const s = {
  panel: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "14px 16px",
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 } satisfies CSSProperties,
  headerIcon: { flexShrink: 0, color: "var(--accent)" } satisfies CSSProperties,
  title: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  /** One complete object per state: hover and keyboard focus share the same background. */
  row: (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "baseline",
    gap: 9,
    width: "100%",
    padding: "7px 8px",
    borderRadius: 6,
    border: "none",
    background: active ? "var(--bg-hover)" : "transparent",
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
  }),
  arrow: { fontSize: 12, color: "var(--accent)" } satisfies CSSProperties,
  path: {
    fontSize: 11.5,
    color: "var(--accent-text)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  reason: {
    fontSize: 12.5,
    lineHeight: 1.4,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  empty: { margin: 0, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
