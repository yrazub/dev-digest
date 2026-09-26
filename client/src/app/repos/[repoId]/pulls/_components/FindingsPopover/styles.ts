import type { CSSProperties } from "react";

export const POPOVER_WIDTH = 340;
export const POPOVER_MAX_HEIGHT = 360;

/** Co-located styles for FindingsPopover. */
export const s = {
  muted: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
  wrap: {
    position: "relative",
    display: "inline-flex",
    width: "fit-content",
    cursor: "help",
  } satisfies CSSProperties,
  badgeRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  popover: {
    position: "fixed",
    zIndex: 1000,
    width: POPOVER_WIDTH,
    maxHeight: POPOVER_MAX_HEIGHT,
    overflowY: "auto",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    boxShadow: "0 8px 24px rgba(0,0,0,.28)",
    padding: 12,
  } satisfies CSSProperties,
  popoverTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  popoverList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  previewRow: {
    borderBottom: "1px solid var(--border)",
    paddingBottom: 10,
  } satisfies CSSProperties,
  previewHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  previewTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  previewMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 11,
    color: "var(--text-muted)",
    marginBottom: 4,
  } satisfies CSSProperties,
  previewPath: { minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  previewConfidence: { marginLeft: "auto", flexShrink: 0, whiteSpace: "nowrap" } satisfies CSSProperties,
  previewRationale: {
    fontSize: 12,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
} as const;
