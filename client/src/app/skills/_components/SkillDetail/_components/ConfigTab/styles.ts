import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 860, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  headRow: { display: "flex", alignItems: "center", marginBottom: 10 } satisfies CSSProperties,
  heading: { fontSize: 15, fontWeight: 600, flex: 1 } satisfies CSSProperties,
  enabled: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 6 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  danger: {
    marginTop: 28,
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid var(--crit-bg)",
    display: "flex",
    alignItems: "center",
    gap: 16,
    justifyContent: "space-between",
  } satisfies CSSProperties,
  dangerTitle: { fontSize: 13.5, fontWeight: 600, color: "var(--crit)", marginBottom: 2 } satisfies CSSProperties,
};
