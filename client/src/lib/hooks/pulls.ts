/* hooks/pulls.ts — React Query hooks for pull requests: GET /repos/:id/pulls, GET /pulls/:id. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PrMeta, PrDetail } from "@/lib/types";

/** Query keys for this resource; import these instead of typing the arrays. */
export const pullKeys = {
  list: (repoId: string | null | undefined) => ["pulls", repoId] as const,
  detail: (prId: string | number | null | undefined) => ["pull", prId] as const,
};

export function usePulls(repoId: string | null | undefined) {
  return useQuery({
    queryKey: pullKeys.list(repoId),
    queryFn: () => api.get<PrMeta[]>(`/repos/${repoId}/pulls`),
    enabled: !!repoId,
    // Auto-refresh PR statuses: re-sync from GitHub every 60s while the page is
    // open, and whenever the window regains focus.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function usePullDetail(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: pullKeys.detail(prId),
    queryFn: () => api.get<PrDetail>(`/pulls/${prId}`),
    enabled: prId != null,
  });
}
