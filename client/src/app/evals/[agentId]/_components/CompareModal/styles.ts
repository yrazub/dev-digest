import type { CSSProperties } from "react";
import { s as evalStyles } from "@/components/eval/styles";

export const s = {
  compareBody: { padding: "16px 18px", maxHeight: 560, overflow: "auto" } satisfies CSSProperties,
  tiles: { display: "flex", gap: 12, marginBottom: 18 } satisfies CSSProperties,
  tile: {
    flex: 1,
    minWidth: 0,
    padding: "12px 14px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  tileValues: { display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,
  tileOld: { fontSize: 15, color: "var(--text-muted)" } satisfies CSSProperties,
  tileArrow: { display: "inline-flex", alignSelf: "center", color: "var(--text-muted)" } satisfies CSSProperties,
  tileNew: (color: string): CSSProperties => ({ fontSize: 21, fontWeight: 700, color }),
  configGrid: { display: "flex", gap: 12, marginBottom: 18 } satisfies CSSProperties,
  configCol: {
    flex: 1,
    minWidth: 0,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  configHead: { fontSize: 11, fontWeight: 700, color: "var(--accent-text)", marginBottom: 4 } satisfies CSSProperties,
  configLine: { ...evalStyles.oneLine, color: "var(--text-secondary)", marginTop: 2 } satisfies CSSProperties,
  diffLegend: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    fontSize: 11.5,
    color: "var(--text-secondary)",
    margin: "8px 0 10px",
  } satisfies CSSProperties,
  diffLegendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  diffSwatch: (background: string): CSSProperties => ({ width: 11, height: 11, borderRadius: 3, background }),
  diffBox: {
    fontSize: 12.5,
    lineHeight: 1.75,
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "14px 16px",
    whiteSpace: "pre-wrap",
    marginBottom: 18,
  } satisfies CSSProperties,
  diffToken: (type: "same" | "add" | "del"): CSSProperties =>
    type === "add"
      ? { background: "var(--code-add)", color: "var(--text-primary)" }
      : type === "del"
        ? { background: "var(--code-del)", color: "var(--crit)", textDecoration: "line-through" }
        : { color: "var(--text-secondary)" },
  noChange: { fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 18px" } satisfies CSSProperties,
  flippedList: { listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  flippedRow: {
    ...evalStyles.oneLine,
    fontSize: 12.5,
    padding: "3px 0",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  costDelta: evalStyles.delta("muted"),
};
