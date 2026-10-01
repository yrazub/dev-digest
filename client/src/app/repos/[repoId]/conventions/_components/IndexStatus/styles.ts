import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", alignItems: "center", gap: 8, marginTop: 4 } satisfies CSSProperties,
  text: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
};
