import type { ProjectContextList, SpecFile } from "@devdigest/shared";
import { compareByPath } from "@/lib/context-display";

export type ViewMode = "loading" | "error" | "not_cloned" | "empty" | "list";

/** The one body the page shows. A failed refetch keeps `data`, so `isError` is checked first. */
export function viewMode(query: {
  data: ProjectContextList | undefined;
  isLoading: boolean;
  isError: boolean;
}): ViewMode {
  if (query.isError) return "error";
  if (query.isLoading || !query.data) return "loading";
  if (query.data.state === "not_cloned") return "not_cloned";
  return query.data.documents.length === 0 ? "empty" : "list";
}

/** Case-insensitive path substring filter, sorted by path. */
export function filterDocuments(documents: readonly SpecFile[], query: string): SpecFile[] {
  const needle = query.trim().toLowerCase();
  return documents.filter((d) => d.path.toLowerCase().includes(needle)).sort(compareByPath);
}
