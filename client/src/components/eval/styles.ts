import type { CSSProperties } from "react";

/* State-dependent styles are functions that return one complete object: a shorthand and its
   longhand never meet across two style objects. */

const WITH_CHECKBOX = "34px 150px 70px 1fr 1fr 1fr 90px 80px";
const WITHOUT_CHECKBOX = "150px 70px 1fr 1fr 1fr 90px 80px";

/** R-WEB-44: one line, an ellipsis, the full text goes in the element's `title`. */
const oneLine = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} satisfies CSSProperties;

const grid = (hasCheckbox: boolean) => (hasCheckbox ? WITH_CHECKBOX : WITHOUT_CHECKBOX);

export const s = {
  oneLine,

  // Metric bar
  bar: { display: "flex", alignItems: "center", gap: 7, minWidth: 0 } satisfies CSSProperties,
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: "var(--bg-hover)",
    overflow: "hidden",
  } satisfies CSSProperties,
  barFill: (value: number | null, color: string): CSSProperties => ({
    width: `${Math.max(0, Math.min(1, value ?? 0)) * 100}%`,
    height: "100%",
    background: color,
  }),
  barLabel: {
    width: 30,
    textAlign: "right",
    fontSize: 11,
    color: "var(--text-secondary)",
    flexShrink: 0,
  } satisfies CSSProperties,

  // Delta label
  delta: (tone: "ok" | "crit" | "muted"): CSSProperties => ({
    fontSize: 11.5,
    fontWeight: 600,
    color: tone === "ok" ? "var(--ok)" : tone === "crit" ? "var(--crit)" : "var(--text-muted)",
  }),

  // Runs table
  panel: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-elevated)",
    marginTop: 8,
  } satisfies CSSProperties,
  headerRow: (hasCheckbox: boolean): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: grid(hasCheckbox),
    gap: 12,
    padding: "9px 16px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  }),
  row: ({
    hasCheckbox,
    selected,
    hovered,
    last,
  }: {
    hasCheckbox: boolean;
    selected: boolean;
    hovered: boolean;
    last: boolean;
  }): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: grid(hasCheckbox),
    gap: 12,
    padding: "10px 16px",
    alignItems: "center",
    fontSize: 12.5,
    cursor: "pointer",
    background: selected || hovered ? "var(--bg-hover)" : "transparent",
    borderBottom: last ? "none" : "1px solid var(--border)",
  }),
  checkbox: {
    width: 16,
    height: 16,
    margin: 0,
    accentColor: "var(--accent)",
    cursor: "pointer",
  } satisfies CSSProperties,
  checkboxDisabled: {
    width: 16,
    height: 16,
    margin: 0,
    accentColor: "var(--accent)",
    cursor: "not-allowed",
    opacity: 0.4,
  } satisfies CSSProperties,
  ranAt: { ...oneLine, fontSize: 11.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  version: {
    ...oneLine,
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  statusChip: (status: "running" | "done" | "failed"): CSSProperties => ({
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: "0.03em",
    textTransform: "uppercase",
    padding: "0 5px",
    borderRadius: 4,
    border: "1px solid currentColor",
    color: status === "failed" ? "var(--crit)" : status === "running" ? "var(--warn)" : "var(--text-muted)",
  }),
  statusSpan: (failed: boolean): CSSProperties => ({
    ...oneLine,
    gridColumn: "span 3",
    fontSize: 12,
    color: failed ? "var(--crit)" : "var(--text-secondary)",
  }),
  pass: { fontWeight: 600, minWidth: 0 } satisfies CSSProperties,
  errored: { fontSize: 10.5, fontWeight: 400, color: "var(--warn)", marginTop: 2 } satisfies CSSProperties,
  cost: { ...oneLine, color: "var(--text-secondary)" } satisfies CSSProperties,

  // Run button
  runButton: { display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 10 } satisfies CSSProperties,
  runError: { fontSize: 12, color: "var(--crit)", margin: 0 } satisfies CSSProperties,
  runErrorLink: { color: "var(--accent-text)", marginLeft: 6 } satisfies CSSProperties,

  // Run drawer
  drawer: {
    position: "fixed",
    top: 0,
    right: 0,
    bottom: 0,
    width: 440,
    maxWidth: "100vw",
    zIndex: 60,
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-elevated)",
    borderLeft: "1px solid var(--border)",
    boxShadow: "-12px 0 32px rgba(0, 0, 0, 0.25)",
  } satisfies CSSProperties,
  drawerHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 18px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  drawerTitle: { ...oneLine, flex: 1, fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  closeBtn: {
    width: 26,
    height: 26,
    display: "inline-grid",
    placeItems: "center",
    borderRadius: 6,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
    flexShrink: 0,
  } satisfies CSSProperties,
  drawerBody: { flex: 1, overflowY: "auto", padding: "14px 18px" } satisfies CSSProperties,
  drawerMuted: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  drawerError: { fontSize: 12.5, color: "var(--crit)" } satisfies CSSProperties,
  resultList: { listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  result: {
    padding: "10px 0",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  resultHead: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  outcomeIcon: (color: string): CSSProperties => ({
    display: "inline-flex",
    color,
    flexShrink: 0,
  }),
  caseName: { ...oneLine, flex: 1, fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
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
  findings: { listStyle: "none", margin: "6px 0 0", padding: 0 } satisfies CSSProperties,
  finding: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    fontSize: 12,
    color: "var(--text-secondary)",
    padding: "2px 0",
    minWidth: 0,
  } satisfies CSSProperties,
  findingLoc: { ...oneLine, fontSize: 11.5, flexShrink: 1, maxWidth: "50%" } satisfies CSSProperties,
  findingTitle: { ...oneLine, flex: 1 } satisfies CSSProperties,
  matches: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "var(--ok)",
    flexShrink: 0,
  } satisfies CSSProperties,
  dropped: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
};
