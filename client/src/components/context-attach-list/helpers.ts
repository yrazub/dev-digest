import type { ProjectContextList, SpecFile } from "@devdigest/shared";
import { compareByPath } from "@/lib/context-display";

/** One row of the list. `doc` is null for an attached path the repository does not have. */
export interface AttachRow {
  path: string;
  doc: SpecFile | null;
  attached: boolean;
}

export type AttachMode = "no_repo" | "loading" | "error" | "not_cloned" | "list";

/** The one body the list shows. A failed refetch keeps `data`, so errors are checked first. */
export function attachMode(input: {
  hasRepo: boolean;
  paths: string[] | undefined;
  pathsLoading: boolean;
  pathsError: boolean;
  files: { data: ProjectContextList | undefined; isLoading: boolean; isError: boolean };
}): AttachMode {
  if (!input.hasRepo) return "no_repo";
  if (input.pathsError || input.files.isError) return "error";
  if (input.pathsLoading || input.files.isLoading || !input.paths || !input.files.data) return "loading";
  return input.files.data.state === "not_cloned" ? "not_cloned" : "list";
}

/** A path split for display: `folder` runs up to and including the last `/` (or is empty), `name` is the rest. */
export function splitPath(path: string): { name: string; folder: string } {
  const cut = path.lastIndexOf("/") + 1;
  return { name: path.slice(cut), folder: path.slice(0, cut) };
}

/** Attached paths in stored order (not-found ones included), then the other documents by path. */
export function orderRows(documents: readonly SpecFile[], paths: readonly string[]): AttachRow[] {
  const byPath = new Map(documents.map((d) => [d.path, d]));
  const attached = paths.map((path) => ({ path, doc: byPath.get(path) ?? null, attached: true }));
  const rest = documents
    .filter((d) => !paths.includes(d.path))
    .sort(compareByPath)
    .map((doc) => ({ path: doc.path, doc, attached: false }));
  return [...attached, ...rest];
}

/** Case-insensitive path substring filter; keeps the order of `rows`. */
export function filterRows(rows: readonly AttachRow[], query: string): AttachRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter((r) => r.path.toLowerCase().includes(needle));
}

/** Tokens of the attached rows; a not-found or null-token row counts 0. */
export function attachedTotal(rows: readonly AttachRow[]): number {
  return rows.reduce((sum, r) => (r.attached ? sum + (r.doc?.tokens ?? 0) : sum), 0);
}

/**
 * Attached readable documents from the first one that crosses `cap` (summing in
 * list order) to the last. Rows without tokens carry no weight and are not named.
 */
export function runCapSkips(rows: readonly AttachRow[], cap: number): string[] {
  const counted = rows.filter((r) => r.attached && r.doc !== null && r.doc.tokens !== null);
  let sum = 0;
  const first = counted.findIndex((r) => (sum += r.doc?.tokens ?? 0) > cap);
  return first < 0 ? [] : counted.slice(first).map((r) => r.path);
}

/** Checking a path appends it to the end; unchecking removes it. */
export function togglePath(paths: readonly string[], path: string, on: boolean): string[] {
  if (on) return paths.includes(path) ? [...paths] : [...paths, path];
  return paths.filter((p) => p !== path);
}

/** Move `fromPath` to `toPath`'s position (drag-and-drop reorder). */
export function movePath(paths: readonly string[], fromPath: string, toPath: string): string[] {
  const from = paths.indexOf(fromPath);
  const to = paths.indexOf(toPath);
  if (from < 0 || to < 0 || from === to) return [...paths];
  const next = [...paths];
  next.splice(to, 0, next.splice(from, 1)[0]!);
  return next;
}
