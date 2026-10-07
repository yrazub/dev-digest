import type {
  FindingRecord,
  PrFile,
  ReviewRecord,
  Severity,
  SmartDiffGroup,
  SmartDiffRole,
} from "@devdigest/shared";
import { isCounted, mostSevere } from "@/components/diff-viewer";

/** Time of a review for ordering; an unparsable stamp sorts as the oldest. */
function reviewTime(r: ReviewRecord): number {
  const t = Date.parse(r.created_at);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
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

/** Which body the Files changed tab draws; exactly one is rendered. */
export type DiffBodyMode =
  /** The PR's files as one flat list: original order, or no files to group. */
  | "flat"
  /** Smart order, grouping still loading: skeleton rows. */
  | "pending"
  /** Smart order with grouping data: files under their role. */
  | "groups"
  /** Smart order, the request failed and there is no grouping to keep: flat list plus a muted line. */
  | "unavailable";

/**
 * The one choice between the bodies. A grouping the user already has wins over
 * a failed background refetch (`hasData` stays true when TanStack Query reports
 * `isError` after an earlier success); the flat list with the notice appears
 * only when there is no grouping to show. With no files there is nothing to
 * group, so the mode is `flat` and no notice is drawn, whatever the request did.
 */
export function diffBodyMode(input: {
  order: "smart" | "original";
  isError: boolean;
  hasData: boolean;
  fileCount: number;
}): DiffBodyMode {
  const { order, isError, hasData, fileCount } = input;
  if (order === "original") return "flat";
  if (hasData) return fileCount > 0 ? "groups" : "flat";
  if (fileCount === 0) return "flat";
  return isError ? "unavailable" : "pending";
}

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
  const inGroup = findings.filter((f) => isCounted(f) && paths.has(f.file));
  const severity = mostSevere(inGroup);
  return severity === null ? null : { files: new Set(inGroup.map((f) => f.file)).size, severity };
}
