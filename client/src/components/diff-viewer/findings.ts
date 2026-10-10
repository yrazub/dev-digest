/* Finding support for the DiffViewer (Files changed tab).
   Pure helpers + the API shape the viewer needs; React bits live in the leaf
   components (FindingDot, LineFindingTag, UnanchoredFindings). The finding
   card itself is drawn by the route and handed in through `renderFinding`. */
import type React from "react";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { lineKey } from "./comments";

/** What the viewer needs to draw the findings of a review inside the diff. */
export interface DiffFindingApi {
  /** Findings of the newest review of each agent, dismissed ones included (they keep their card).
   *  The viewer derives dots, stripes and tags from the non-dismissed ones. */
  findings: FindingRecord[];
  /** When false, cards are hidden; stripes, tags and dots stay. */
  showFindings: boolean;
  /** Draws one finding; supplied by the route (wraps FindingCard). */
  renderFinding: (finding: FindingRecord) => React.ReactNode;
}

/** Lower rank = more severe. Keyed by the exact enum values. */
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/** A finding counts towards the dot, the stripe and the tag unless it was dismissed. */
export function isCounted(f: FindingRecord): boolean {
  return f.dismissed_at == null;
}

/** The findings that belong to one file (exact path match). */
export function findingsForFile(findings: FindingRecord[], path: string): FindingRecord[] {
  return findings.filter((f) => f.file === path);
}

/** `RIGHT:<start_line>` — the key a finding is matched to a rendered line on. */
export function findingLineKey(f: FindingRecord): string | null {
  return lineKey("RIGHT", f.start_line);
}

/** The most severe severity of a list, or null for an empty one. */
export function mostSevere(findings: FindingRecord[]): Severity | null {
  let best: Severity | null = null;
  for (const f of findings) {
    if (best === null || SEVERITY_RANK[f.severity] < SEVERITY_RANK[best]) best = f.severity;
  }
  return best;
}

/** A copy of the list with the most severe first (stable for equal severities). */
export function sortBySeverity(findings: FindingRecord[]): FindingRecord[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

/**
 * Split a file's findings into those anchored to a rendered line (keyed by
 * `RIGHT:<start_line>`) and unanchored ones whose line is not in this patch
 * (or whose file has no patch). The unanchored bucket is surfaced separately
 * so nothing is silently dropped.
 */
export function partitionFindings(
  fileFindings: FindingRecord[],
  renderedKeys: Set<string>,
): { anchored: Map<string, FindingRecord[]>; unanchored: FindingRecord[] } {
  const anchored = new Map<string, FindingRecord[]>();
  const unanchored: FindingRecord[] = [];
  for (const f of fileFindings) {
    const key = findingLineKey(f);
    if (key && renderedKeys.has(key)) {
      const list = anchored.get(key) ?? [];
      list.push(f);
      anchored.set(key, list);
    } else {
      unanchored.push(f);
    }
  }
  return { anchored, unanchored };
}
