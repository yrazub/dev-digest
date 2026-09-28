import type { CSSProperties } from "react";

export const s = {
  stack: { display: "flex", flexDirection: "column", gap: 10, padding: 4 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", padding: "8px 4px" } satisfies CSSProperties,
};
