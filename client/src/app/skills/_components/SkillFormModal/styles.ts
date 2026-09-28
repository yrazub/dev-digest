import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 } satisfies CSSProperties,
};
