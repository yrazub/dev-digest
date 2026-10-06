import type { IconName } from "@devdigest/ui";
import type { IntentConfidence, IntentRiskKind } from "@devdigest/shared";

/** Icon per risk-area kind. */
export const RISK_ICON: Record<IntentRiskKind, IconName> = {
  security: "Shield",
  dependency: "Boxes",
  performance: "Zap",
  data: "Database",
  api: "Code",
  other: "AlertTriangle",
};

/** Dot-badge colours per confidence level. The badge always carries a text label too. */
export const CONFIDENCE_STYLE: Record<IntentConfidence, { color: string; bg: string }> = {
  high: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};
