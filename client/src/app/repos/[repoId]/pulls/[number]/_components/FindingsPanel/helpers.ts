import type { FindingRecord, Severity } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER, SEVERITIES } from "./constants";

export type SeverityCounts = { CRITICAL: number; WARNING: number; SUGGESTION: number };

/** Optionally drop low-confidence findings, optionally filter to one severity, then sort. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  sevFilter: Severity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (sevFilter) shown = shown.filter((f) => f.severity === sevFilter);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** Tally a finding list into CRITICAL/WARNING/SUGGESTION counts. */
export function countBySeverity(findings: FindingRecord[]): SeverityCounts {
  const c: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity === "CRITICAL") c.CRITICAL += 1;
    else if (f.severity === "WARNING") c.WARNING += 1;
    else if (f.severity === "SUGGESTION") c.SUGGESTION += 1;
  }
  return c;
}

/** A severity-counts object → ordered [severity, count] pairs, zero counts dropped. */
export function severityCounts(
  counts: SeverityCounts | null | undefined,
): [Severity, number][] {
  if (!counts) return [];
  return SEVERITIES.map((sev) => [sev, counts[sev]] as [Severity, number]).filter(
    ([, n]) => n > 0,
  );
}
