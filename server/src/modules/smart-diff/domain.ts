import type { SmartDiff, SmartDiffFile, SmartDiffGroup } from '@devdigest/shared';
import { ROLE_ORDER } from '../_shared/file-role/constants.js';
import { classifyFile } from '../_shared/file-role/classify.js';

/**
 * L03 — smart-diff rules. Pure: a PR's files and findings in, the grouped response out.
 * No I/O, no framework; the role patterns live in `modules/_shared/file-role/`.
 */

export interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface FindingRef {
  file: string;
  startLine: number;
  dismissedAt: Date | null;
}

export interface ReviewFindings {
  agentId: string | null;
  createdAt: Date;
  findings: FindingRef[];
}

/**
 * Findings of the newest review of each agent (a null `agentId` is one agent), without the
 * dismissed ones. On equal `createdAt` the review earlier in the input wins — the repository
 * returns newest first.
 */
export function countedFindings(reviews: ReviewFindings[]): FindingRef[] {
  const newest = new Map<string | null, ReviewFindings>();
  for (const review of reviews) {
    const current = newest.get(review.agentId);
    if (!current || review.createdAt.getTime() > current.createdAt.getTime()) {
      newest.set(review.agentId, review);
    }
  }
  return [...newest.values()].flatMap((review) => review.findings.filter((f) => f.dismissedAt === null));
}

/** Code-unit order, not `localeCompare`: the same result on every machine. */
function byPath(a: { path: string }, b: { path: string }): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/** Always five groups in `ROLE_ORDER`; a finding for a path outside `files` is ignored. */
export function buildSmartDiff(files: ChangedFile[], findings: FindingRef[]): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const finding of findings) {
    const lines = linesByFile.get(finding.file) ?? new Set<number>();
    lines.add(finding.startLine);
    linesByFile.set(finding.file, lines);
  }

  const groups: SmartDiffGroup[] = ROLE_ORDER.map((role) => ({ role, files: [] }));
  let totalLines = 0;
  for (const file of [...files].sort(byPath)) {
    const entry: SmartDiffFile = {
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: [...(linesByFile.get(file.path) ?? [])].sort((a, b) => a - b),
    };
    const role = classifyFile(file.path);
    groups.find((g) => g.role === role)?.files.push(entry);
    totalLines += file.additions + file.deletions;
  }

  return { groups, split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] } };
}
