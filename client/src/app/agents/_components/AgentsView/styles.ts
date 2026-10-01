import type { CSSProperties } from "react";

/** Co-located styles for AgentsView. */
export const s = {
  stack: { display: "flex", flexDirection: "column", gap: 10, padding: 4 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", padding: "8px 4px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, padding: "18px 28px 0", flexShrink: 0 } satisfies CSSProperties,
  icon: { color: "var(--accent)" } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 } satisfies CSSProperties,
  runButton: { marginLeft: "auto" } satisfies CSSProperties,
  editor: { flex: 1, minHeight: 0, overflow: "auto" } satisfies CSSProperties,
  pad: { padding: 28, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
};
