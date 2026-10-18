import type { CSSProperties } from "react";

/** Co-located styles for PrBriefSection. CSS variables only. */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  summaryPanel: {
    padding: 16,
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  summary: {
    margin: 0,
    fontSize: 13.5,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  note: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  noteIcon: { flexShrink: 0, color: "var(--warn)" } satisfies CSSProperties,
  noteAction: { marginLeft: 4 } satisfies CSSProperties,
  generateError: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    margin: 0,
    fontSize: 12.5,
    color: "var(--crit)",
  } satisfies CSSProperties,
  link: { color: "var(--accent-text)" } satisfies CSSProperties,
  emptyCard: {
    maxWidth: 340,
    margin: "0 auto",
    textAlign: "center",
  } satisfies CSSProperties,
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "var(--bg-hover)",
    color: "var(--text-muted)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 14px",
  } satisfies CSSProperties,
  emptyTitle: {
    margin: "0 0 6px",
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  emptyHint: {
    margin: "0 0 18px",
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  /** One complete object per state; two columns, or one below the breakpoint. */
  grid: (narrow: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: narrow ? "1fr" : "1fr 1fr",
    gap: 16,
  }),
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  footerLine: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 6,
  } satisfies CSSProperties,
} as const;
