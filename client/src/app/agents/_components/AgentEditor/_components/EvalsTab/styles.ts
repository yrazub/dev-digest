import type { CSSProperties } from "react";

/* Co-located styles of the Evals tab and its case rows. State-dependent styles are functions
   that return one complete object: a shorthand and its longhand never meet. */

const mutedSmall = { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties;

export const s = {
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  headerLabel: { flex: 1 } satisfies CSSProperties,

  // Metric strip
  strip: { display: "flex", gap: 10, marginBottom: 18 } satisfies CSSProperties,
  tile: {
    flex: 1,
    padding: "11px 13px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    minWidth: 0,
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  tileValue: (color: string): CSSProperties => ({ fontSize: 22, fontWeight: 700, color }),
  tileDelta: { marginTop: 2, minHeight: 16 } satisfies CSSProperties,

  scoringNote: {
    display: "flex",
    gap: 6,
    marginBottom: 20,
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  // Cases header
  casesHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } satisfies CSSProperties,
  casesHeading: { fontSize: 16, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  muted: { fontSize: 12.5, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", margin: 0 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,

  // Case row
  caseItem: { marginBottom: 6 } satisfies CSSProperties,
  caseRow: (hovered: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: hovered ? "var(--bg-hover)" : "var(--bg-elevated)",
  }),
  outcomeIcon: (color: string): CSSProperties => ({ display: "inline-flex", color, flexShrink: 0 }),
  caseText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  nameLine: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  caseName: {
    fontSize: 12.5,
    fontWeight: 600,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  kindPill: (color: string, bg: string, border: string): CSSProperties => ({
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    padding: "1px 7px",
    borderRadius: 4,
    color,
    background: bg,
    border: `1px solid ${border}`,
    flexShrink: 0,
  }),
  subLine: {
    ...mutedSmall,
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  rowBtn: (opts: { active: boolean; disabled: boolean; danger: boolean }): CSSProperties => ({
    width: 26,
    height: 26,
    display: "inline-grid",
    placeItems: "center",
    borderRadius: 6,
    border: "1px solid transparent",
    background: "transparent",
    color: opts.danger ? "var(--crit)" : "var(--text-secondary)",
    cursor: opts.disabled ? "not-allowed" : "pointer",
    opacity: opts.disabled ? 0.4 : opts.active ? 1 : 0.4,
    flexShrink: 0,
  }),
  fragment: {
    margin: "6px 0 0",
    padding: "10px 12px",
    fontSize: 12,
    lineHeight: 1.6,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflowX: "auto",
    maxHeight: 320,
    overflowY: "auto",
  } satisfies CSSProperties,

  // Runs
  runs: { marginTop: 24 } satisfies CSSProperties,
  showMore: { display: "flex", justifyContent: "center", marginTop: 8 } satisfies CSSProperties,

  // Delete confirm
  confirmText: { margin: 0 } satisfies CSSProperties,
  confirmError: { margin: "10px 0 0", fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
} as const;
