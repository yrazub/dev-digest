import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  loading: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  intro: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    marginBottom: 14,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--text-secondary)",
    fontSize: 13,
  } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  footerNote: { flex: 1, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
};
