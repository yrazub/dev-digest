import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 900 } satisfies CSSProperties,
  headRow: { display: "flex", alignItems: "baseline", gap: 10 } satisfies CSSProperties,
  heading: { fontSize: 15, fontWeight: 600 } satisfies CSSProperties,
  muted: { fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 12px" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  item: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" } satisfies CSSProperties,
  version: { fontWeight: 600, fontSize: 13, minWidth: 34 } satisfies CSSProperties,
  note: (has: boolean): CSSProperties => ({
    flex: 1,
    fontSize: 13,
    color: has ? "var(--text-primary)" : "var(--text-muted)",
    fontStyle: has ? "normal" : "italic",
  }),
  date: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  diff: { borderTop: "1px solid var(--border)", padding: 10 } satisfies CSSProperties,
  confirm: { padding: 24, margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--text-secondary)" } satisfies CSSProperties,
};
