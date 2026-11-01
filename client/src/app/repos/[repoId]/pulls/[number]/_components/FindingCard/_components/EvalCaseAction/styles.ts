import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseAction. */
export const s = {
  /** Hoverable wrapper that carries the tooltip of a disabled button. `relative` anchors the
   *  absolutely positioned `visuallyHidden` span here, so it cannot escape the scrolling `main`
   *  and stretch the page into a second scrollbar. */
  tooltipWrap: { display: "inline-flex", position: "relative" } satisfies CSSProperties,
  /** Screen-reader-only text the disabled button's `aria-describedby` points at. */
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  } satisfies CSSProperties,
  /** The saved / in-set line, on its own line under the action row. */
  line: {
    flexBasis: "100%",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  error: {
    flexBasis: "100%",
    fontSize: 12,
    color: "var(--crit)",
  } satisfies CSSProperties,
} as const;
