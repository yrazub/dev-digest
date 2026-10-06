/* hooks/intent.ts — React Query hooks for the L03 PR intent (the Intent card).
   GET reads the stored intent; POST re-derives it and writes the result into the cache. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentResponse } from "@devdigest/shared";

export const intentKeys = {
  detail: (prId: string | null | undefined) => ["pr-intent", prId] as const,
};

/** `poll` is true while a review run is in flight: the run derives the intent in its pre-work. */
export function usePrIntent(
  prId: string | null | undefined,
  { poll = false }: { poll?: boolean } = {},
) {
  return useQuery({
    queryKey: intentKeys.detail(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
    refetchInterval: poll ? 4000 : false,
  });
}

export function useRegenerateIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent`),
    onSuccess: (res) => qc.setQueryData(intentKeys.detail(prId), res),
  });
}
