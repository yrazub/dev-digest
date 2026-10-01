/* hooks/conventions.ts — React Query hooks for the L02 Conventions screen. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionList,
  ConventionSkillCreate,
  ConventionSkillDraft,
  ConventionUpdate,
  Skill,
} from "@devdigest/shared";

const key = (repoId: string) => ["conventions", repoId] as const;

export function useConventions(repoId: string) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<ConventionList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Run Scan / ReScan. Synchronous on the server (one model call), so it can take a minute. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (res) => {
      qc.setQueryData<ConventionList>(key(repoId), {
        scan: { last_scan_at: res.stats.scanned_at, sampled_files: res.stats.sampled_files },
        candidates: res.candidates,
      });
    },
  });
}

/** Accept / reject / inline edit. Optimistic: the card changes at once and rolls back on failure. */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionUpdate }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key(repoId) });
      const previous = qc.getQueryData<ConventionList>(key(repoId));
      if (previous) {
        qc.setQueryData<ConventionList>(key(repoId), {
          ...previous,
          candidates: previous.candidates.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key(repoId), ctx.previous);
    },
    onSuccess: (updated) => {
      qc.setQueryData<ConventionList>(key(repoId), (list) =>
        list && { ...list, candidates: list.candidates.map((c) => (c.id === updated.id ? updated : c)) },
      );
    },
  });
}

/** The merged draft for the Create skill modal. Stores nothing. */
export function useConventionSkillDraft(repoId: string) {
  return useMutation({
    mutationFn: (candidateIds: string[]) =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`, {
        candidate_ids: candidateIds,
      }),
  });
}

export function useCreateConventionSkill(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConventionSkillCreate) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: (skill) => {
      qc.setQueryData(["skill", skill.id], skill);
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}
