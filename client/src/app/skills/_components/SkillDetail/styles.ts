import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, padding: "18px 28px 4px" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  tabsBar: { borderBottom: "1px solid var(--border)", flexShrink: 0 } satisfies CSSProperties,
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: "20px 28px 28px" } satisfies CSSProperties,
};
