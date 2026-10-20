import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

/** Icon per risk kind; any other kind falls back to `AlertTriangle`. */
export const RISK_KIND_ICON: Record<string, IconName> = {
  security: "Shield",
  db_migration: "Database",
  breaking_api: "AlertOctagon",
  perf: "Zap",
  deps: "Boxes",
};

/** Icon colour per risk severity. */
export const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--info)",
};

/** Review focus path budget: whole up to this many characters, otherwise head + "…" + tail. */
export const PATH_MAX = 56;
export const PATH_HEAD = 20;
export const PATH_TAIL = 35;
