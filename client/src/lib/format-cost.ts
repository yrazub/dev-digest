/** A run's USD cost at 4 decimal places ($0.0013); em-dash when unknown. */
export function formatCostUsd(usd: number | null | undefined): string {
  // `== null` on purpose: an unknown cost (null, or undefined on traces written
  // before cost_usd existed) must never render as $0.0000 — zero is a claim.
  if (usd == null) return "—";
  return `$${usd.toFixed(4)}`;
}
