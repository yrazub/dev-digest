/* hooks/blast.ts — React Query hook for the L04 Blast radius (changed symbols, their callers
   and the endpoints and cron jobs in the calling files).
   GET reads the map of the PR's current head from the repo-intel index; there is no polling —
   a finished resync invalidates `blastKeys.pull(prId)` and the data is read again. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadiusResponse } from "@devdigest/shared";

export const blastKeys = {
  /** Prefix of every head of one PR — what a finished resync invalidates. */
  pull: (prId: string | null | undefined) => ["blast", prId] as const,
  detail: (prId: string | null | undefined, headSha: string | null | undefined) =>
    ["blast", prId, headSha] as const,
};

/** Waits until both ids are known; a new `headSha` is a new query, so a push is never served stale. */
export function useBlastRadius(
  prId: string | null | undefined,
  headSha: string | null | undefined,
) {
  return useQuery({
    queryKey: blastKeys.detail(prId, headSha),
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId && !!headSha,
  });
}
