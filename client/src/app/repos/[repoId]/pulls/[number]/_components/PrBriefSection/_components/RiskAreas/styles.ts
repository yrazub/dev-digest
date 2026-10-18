import type { CSSProperties } from "react";

/** Co-located styles for RiskAreas. CSS variables only. */
export const s = {
  row: { display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,
  entry: {
    display: "inline-flex",
    flexDirection: "column",
    gap: 2,
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: "5px 9px",
  } satisfies CSSProperties,
  title: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  /** The kind icon, coloured by severity. */
  icon: (color: string): CSSProperties => ({ flexShrink: 0, color }),
  ref: { fontSize: 10.5, color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { margin: 0, fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
