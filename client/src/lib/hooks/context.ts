/* hooks/context.ts — React Query hooks for the project context documents:
   GET /repos/:id/context, GET /repos/:id/context/file?path=. */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProjectContextFile, ProjectContextList } from "@devdigest/shared";
import { api } from "@/lib/api";

/** Query keys for this resource; import these instead of typing the arrays. */
export const contextKeys = {
  list: (repoId: string | null | undefined) => ["context", repoId] as const,
  file: (repoId: string | null | undefined, path: string | null | undefined) =>
    ["context-file", repoId, path] as const,
  /** Prefix of every `file` key — what a save invalidates ("Used by" counts). */
  files: ["context-file"] as const,
};

export function useContextFiles(repoId: string | null | undefined) {
  return useQuery({
    queryKey: contextKeys.list(repoId),
    queryFn: () => api.get<ProjectContextList>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useContextFile(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: contextKeys.file(repoId, path),
    queryFn: () =>
      api.get<ProjectContextFile>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path,
  });
}
