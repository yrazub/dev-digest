import type { CSSProperties } from "react";

/* Co-located styles of the agent's eval view. State-dependent styles are functions that return
   one complete object: a shorthand and its longhand never meet across two style objects. */

const oneLine = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} satisfies CSSProperties;

export const s = {
  page: { padding: "20px 28px 40px", maxWidth: 980, margin: "0 auto" } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  muted: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,

  // Back link
  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    padding: "4px 8px 4px 4px",
    borderRadius: 6,
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 12.5,
    fontWeight: 600,
  } satisfies CSSProperties,

  // Header
  header: { display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 18 } satisfies CSSProperties,
  headerMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  title: { ...oneLine, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  modelChip: {
    ...oneLine,
    flexShrink: 0,
    maxWidth: 220,
    fontSize: 11.5,
    fontWeight: 500,
    color: "var(--text-muted)",
    padding: "2px 7px",
    borderRadius: 5,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 3 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } satisfies CSSProperties,

  // Regression banner
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    marginBottom: 18,
  } satisfies CSSProperties,
  bannerIcon: { display: "inline-flex", color: "var(--warn)", flexShrink: 0 } satisfies CSSProperties,
  bannerText: { fontSize: 13, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,

  // Metric cards
  cards: { display: "flex", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  card: {
    flex: 1,
    minWidth: 0,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 16,
  } satisfies CSSProperties,
  cardHead: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  cardLabel: {
    ...oneLine,
    flex: 1,
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.03em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  sparkline: { flexShrink: 0, width: 56, height: 20 } satisfies CSSProperties,
  cardValue: (color: string): CSSProperties => ({
    fontSize: 30,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color,
    marginTop: 6,
  }),
  cardSuffix: { fontSize: 16, fontWeight: 400, color: "var(--text-muted)" } satisfies CSSProperties,
  cardDelta: { marginTop: 4, minHeight: 16 } satisfies CSSProperties,

  // Trend card
  trend: { marginBottom: 20 } satisfies CSSProperties,
  legend: { display: "flex", alignItems: "center", gap: 14, fontSize: 11.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  legendSwatch: (color: string): CSSProperties => ({ width: 10, height: 2, background: color }),
  chart: { width: "100%", height: 200 } satisfies CSSProperties,
  tooltip: {
    padding: "5px 9px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 12,
  } satisfies CSSProperties,

  // Runs
  runsHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  runsHint: { fontSize: 11.5, color: "var(--text-muted)", marginBottom: 14 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  showMore: { display: "flex", justifyContent: "center", marginTop: 8 } satisfies CSSProperties,
};
