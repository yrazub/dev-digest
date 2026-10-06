import type { FindingRecord, PrFile, ReviewRecord } from "@devdigest/shared";

/** Time of a review for ordering; an unparsable stamp sorts as the oldest. */
function reviewTime(r: ReviewRecord): number {
  const t = Date.parse(r.created_at);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** A finding counts towards the switch's number unless it was dismissed. */
function isCounted(f: FindingRecord): boolean {
  return f.dismissed_at == null;
}

/**
 * The shown findings: every finding of the newest review of each agent
 * (`agent_id`; null is one agent), dismissed ones included. On equal
 * `created_at` the review earlier in the input wins.
 */
export function findingsOfLatestReviews(reviews: ReviewRecord[]): FindingRecord[] {
  const newest = new Map<string | null, ReviewRecord>();
  for (const r of reviews) {
    const current = newest.get(r.agent_id);
    if (current === undefined || reviewTime(r) > reviewTime(current)) newest.set(r.agent_id, r);
  }
  return [...newest.values()].flatMap((r) => r.findings);
}

/** Counted (not dismissed) findings whose file is one of the PR's files. */
export function countedInDiff(findings: FindingRecord[], files: PrFile[]): number {
  const paths = new Set(files.map((f) => f.path));
  return findings.filter((f) => isCounted(f) && paths.has(f.file)).length;
}
