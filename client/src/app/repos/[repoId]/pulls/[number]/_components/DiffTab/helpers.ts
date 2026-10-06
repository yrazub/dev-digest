import type {
  FindingRecord,
  PrFile,
  ReviewRecord,
  Severity,
  SmartDiffGroup,
  SmartDiffRole,
} from "@devdigest/shared";

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

/** Lower rank = more severe. Keyed by the exact enum values. */
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/**
 * Join the grouping of the API with the PR's files. Groups keep the response
 * order, and so do the files inside them; a response path with no `PrFile` is
 * skipped; a `PrFile` the response does not mention goes to `ungrouped`, so no
 * file disappears.
 */
export function joinGroups(
  groups: SmartDiffGroup[],
  files: PrFile[],
): { groups: { role: SmartDiffRole; files: PrFile[] }[]; ungrouped: PrFile[] } {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const placed = new Set<string>();
  const joined = groups.map((g) => {
    const members: PrFile[] = [];
    for (const entry of g.files) {
      const file = byPath.get(entry.path);
      if (file === undefined || placed.has(entry.path)) continue;
      placed.add(entry.path);
      members.push(file);
    }
    return { role: g.role, files: members };
  });
  return { groups: joined, ungrouped: files.filter((f) => !placed.has(f.path)) };
}

/**
 * The mark on a group header: how many of its files have a counted finding,
 * and the most severe counted one. Null when no file has one.
 */
export function groupFindingMark(
  files: PrFile[],
  findings: FindingRecord[],
): { files: number; severity: Severity } | null {
  const paths = new Set(files.map((f) => f.path));
  const withFindings = new Set<string>();
  let severity: Severity | null = null;
  for (const f of findings) {
    if (!isCounted(f) || !paths.has(f.file)) continue;
    withFindings.add(f.file);
    if (severity === null || SEVERITY_RANK[f.severity] < SEVERITY_RANK[severity]) severity = f.severity;
  }
  return severity === null ? null : { files: withFindings.size, severity };
}
