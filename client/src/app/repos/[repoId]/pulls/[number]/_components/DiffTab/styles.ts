import type { CSSProperties } from "react";

/** Co-located styles for DiffTab. */
export const s = {
  totals: {
    margin: "0 0 12px",
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
