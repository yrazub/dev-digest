import type { BlastRadiusResponse, ChangedSymbol, DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { CALLABLE_KINDS } from "./constants";

export type BlastBodyMode = "loading" | "error" | "noFiles" | "noSymbols" | "noCallers" | "map";

/**
 * The one body the block renders. A failed background refetch keeps the data, so the mode of
 * the data wins over `isError`; the error mode is only for a request that never produced data.
 */
export function blastBodyMode({
  data,
  isError,
}: {
  data: BlastRadiusResponse | undefined;
  isError: boolean;
}): BlastBodyMode {
  if (!data) return isError ? "error" : "loading";
  if (data.reason === "pr_files_missing") return "noFiles";
  if (data.totals.symbols === 0) return "noSymbols";
  if (data.downstream.length === 0) return "noCallers";
  return "map";
}

/**
 * GitHub blob URL of a caller line, pinned to the indexed commit (the one the line numbers
 * refer to) or, when the response carries none, to the PR's head. `null` while the repository
 * name or both commits are unknown: the caller is then plain text.
 */
export function callerHref(
  repoFullName: string | null | undefined,
  indexedSha: string | null,
  headSha: string | null | undefined,
  file: string,
  line: number,
): string | null {
  const sha = indexedSha ?? headSha;
  if (!repoFullName || !sha) return null;
  return githubBlobUrl(repoFullName, sha, file, line);
}

/** A group at the server's per-symbol limit may have more callers than it lists. */
export function groupIsCut(group: DownstreamImpact, callerLimit: number): boolean {
  return group.callers.length >= callerLimit;
}

/** Symbol name for display: `()` after a function or method, by the kind of the first entry of that name. */
export function symbolLabel(name: string, changedSymbols: ChangedSymbol[]): string {
  const kind = changedSymbols.find((c) => c.name === name)?.kind;
  return kind !== undefined && CALLABLE_KINDS.has(kind) ? `${name}()` : name;
}
