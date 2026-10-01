/* hooks/skills.ts — React Query hooks for the L02 Skills screens. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Skill,
  SkillCreate,
  SkillImportDraft,
  SkillUpdate,
  SkillVersion,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillCreate) => api.post<Skill>("/skills", input),
    onSuccess: (skill) => {
      qc.setQueryData(["skill", skill.id], skill);
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

/** A saved skill changes lists, its versions, and every agent's Skills tab. */
function useSettleSkill() {
  const qc = useQueryClient();
  return (skill: Skill) => {
    qc.setQueryData(["skill", skill.id], skill);
    qc.invalidateQueries({ queryKey: ["skills"] });
    qc.invalidateQueries({ queryKey: ["skill-versions", skill.id] });
    qc.invalidateQueries({ queryKey: ["agent-skills"] });
  };
}

export function useUpdateSkill() {
  const settle = useSettleSkill();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SkillUpdate }) =>
      api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: settle,
  });
}

export function useRestoreSkillVersion() {
  const settle = useSettleSkill();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: settle,
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ["skill", id] });
      qc.removeQueries({ queryKey: ["skill-versions", id] });
      qc.invalidateQueries({ queryKey: ["skills"] });
      // Links cascade, so agent skill counts and Skills tabs change too.
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent"] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

/** Parse an uploaded .md / .zip into a draft for the preview. Stores nothing. */
export function useImportSkillFile() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.upload<SkillImportDraft>("/skills/import/file", form);
    },
  });
}

/** Fetch a public .md URL into a draft for the preview. Stores nothing. */
export function useImportSkillUrl() {
  return useMutation({
    mutationFn: (url: string) => api.post<SkillImportDraft>("/skills/import/url", { url }),
  });
}
