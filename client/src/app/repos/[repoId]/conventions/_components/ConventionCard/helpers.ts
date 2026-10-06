import type { ConventionCandidate } from "@devdigest/shared";

/** `path:start-end`, or `path:line` for a one-line range. */
export function evidenceLabel(c: ConventionCandidate): string {
  return c.evidence_line_start === c.evidence_line_end
    ? `${c.evidence_path}:${c.evidence_line_start}`
    : `${c.evidence_path}:${c.evidence_line_start}-${c.evidence_line_end}`;
}

/** Bar colour by confidence: strong, fair, weak. */
export function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return "var(--ok)";
  if (confidence >= 0.6) return "var(--warn)";
  return "var(--text-muted)";
}

/** Band labels, lowest first; the server's draft uses the same thresholds. */
const CONFIDENCE_LEVELS = ["low", "medium", "high"];

export type ConfidenceLevel = "low" | "medium" | "high";

/** The band a 0–1 confidence falls in: below 0.6 low, below 0.8 medium, otherwise high. */
export function confidenceLevel(confidence: number): ConfidenceLevel {
  const index = confidence < 0.6 ? 0 : confidence < 0.8 ? 1 : 2;
  return CONFIDENCE_LEVELS[index] as ConfidenceLevel;
}
