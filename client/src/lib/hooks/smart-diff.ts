/* hooks/smart-diff.ts — React Query hook for the L03 Smart Diff (files grouped by role).
   GET reads the grouping of the PR's current head; there is no polling — a finished run
   invalidates `smartDiffKeys.pull(prId)` and the data is read again. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { SmartDiffResponse } from "@devdigest/shared";

export const smartDiffKeys = {
  /** Prefix of every head of one PR — what a finished run invalidates. */
  pull: (prId: string | null | undefined) => ["smart-diff", prId] as const,
  detail: (prId: string | null | undefined, headSha: string | null | undefined) =>
    ["smart-diff", prId, headSha] as const,
};

/** Waits until both ids are known; a new `headSha` is a new query, so a push is never served stale. */
export function useSmartDiff(
  prId: string | null | undefined,
  headSha: string | null | undefined,
) {
  return useQuery({
    queryKey: smartDiffKeys.detail(prId, headSha),
    queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`),
    enabled: !!prId && !!headSha,
  });
}
