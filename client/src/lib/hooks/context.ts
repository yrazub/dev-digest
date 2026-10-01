/* hooks/context.ts — React Query hooks for project context files:
   GET /repos/:id/context, POST /repos/:id/context/reindex. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SpecFile, IndexStatus } from "@/lib/types";

/** Query keys for this resource; import these instead of typing the arrays. */
export const contextKeys = {
  list: (repoId: string | null | undefined) => ["context", repoId] as const,
};

export function useContextFiles(repoId: string | null | undefined) {
  return useQuery({
    queryKey: contextKeys.list(repoId),
    queryFn: () => api.get<SpecFile[]>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useReindexContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<IndexStatus>(`/repos/${repoId}/context/reindex`),
    onSuccess: (_d, repoId) => qc.invalidateQueries({ queryKey: contextKeys.list(repoId) }),
  });
}
