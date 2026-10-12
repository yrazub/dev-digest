/** A duration for a narrow table cell: 850ms, 2.4s, 1m 05s; em-dash when unknown. */
export function formatDuration(ms: number | null | undefined): string {
  // `== null` on purpose, as in formatCostUsd: an unknown duration must not render as 0ms.
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}
