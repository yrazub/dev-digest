import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 12 } satisfies CSSProperties,
  article: {
    padding: "18px 22px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
};
