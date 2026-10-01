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
