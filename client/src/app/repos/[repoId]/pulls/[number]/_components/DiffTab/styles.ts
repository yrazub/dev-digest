import type { CSSProperties } from "react";

/** Co-located styles for DiffTab. */
export const s = {
  totalsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    margin: "0 0 12px",
  } satisfies CSSProperties,
  totals: {
    margin: 0,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  notice: {
    margin: "0 0 12px",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  skeletonList: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  group: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "6px 4px",
    border: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 13,
    textAlign: "left",
    cursor: "pointer",
  } satisfies CSSProperties,
  groupLabel: { fontWeight: 600 } satisfies CSSProperties,
  groupHint: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  groupMark: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  groupCount: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  groupBody: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  orderSwitch: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflow: "hidden",
  } satisfies CSSProperties,
  /** Chevron turns down when the group is open. */
  groupChevron: (open: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    flexShrink: 0,
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  }),
  /** The small square in the role's colour. */
  roleSquare: (color: string): CSSProperties => ({
    width: 10,
    height: 10,
    borderRadius: 2,
    flexShrink: 0,
    background: color,
  }),
  /** The dot of the findings mark, in the colour of the most severe finding. */
  markDot: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
    background: color,
  }),
  /** One button of the order switch; the active one is filled. */
  orderButton: (active: boolean): CSSProperties => ({
    padding: "4px 10px",
    border: "none",
    fontSize: 12,
    cursor: "pointer",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    background: active ? "var(--bg-elevated)" : "transparent",
    fontWeight: active ? 600 : 400,
  }),
} as const;
