/* hooks/brief.ts — React Query hooks for the L05 PR brief (the PR Brief section).
   GET reads the stored brief and never calls a model; POST generates one and writes the
   result into the same cache entry. The key carries the PR's head SHA, so a new head refetches. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBriefResponse } from "@devdigest/shared";

export const briefKeys = {
  detail: (prId: string | null | undefined, headSha: string | null | undefined) =>
    ["pr-brief", prId, headSha] as const,
};

export function usePrBrief(prId: string | null | undefined, headSha: string | null | undefined) {
  return useQuery({
    queryKey: briefKeys.detail(prId, headSha),
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

export function useGenerateBrief(prId: string | null | undefined, headSha: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    onSuccess: (res) => qc.setQueryData(briefKeys.detail(prId, headSha), res),
  });
}
