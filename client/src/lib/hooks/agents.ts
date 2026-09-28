/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Agent, AgentSkill, ModelInfo, Provider, ReviewStrategy } from "@devdigest/shared";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  enabled?: boolean;
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export interface UpdateAgentInput {
  id: string;
  patch: Partial<
    Pick<
      Agent,
      | "name"
      | "description"
      | "provider"
      | "model"
      | "system_prompt"
      | "output_schema"
      | "strategy"
      | "ci_fail_on"
      | "repo_intel"
      | "enabled"
    >
  >;
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put<Agent>(`/agents/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.setQueryData(["agent", data.id], data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.removeQueries({ queryKey: ["agent", id] });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: ["provider-models", provider],
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

/** Every workspace skill as seen from one agent (linked first, in prompt order). */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkill[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * The list as it will look once `linkedIds` (in order) are the agent's links:
 * linked rows first in that order, then the rest in their current order.
 */
export function applyLinkOrder(list: AgentSkill[], linkedIds: string[]): AgentSkill[] {
  const byId = new Map(list.map((s) => [s.id, s]));
  const linked: AgentSkill[] = [];
  for (const id of linkedIds) {
    const s = byId.get(id);
    if (s) linked.push({ ...s, linked: true, order: linked.length });
  }
  const set = new Set(linkedIds);
  const rest = list.filter((s) => !set.has(s.id)).map((s) => ({ ...s, linked: false, order: null }));
  return [...linked, ...rest];
}

/**
 * Replace the agent's linked skills with `linkedIds`, in that order — the order
 * of their blocks in the prompt. Optimistic: the Skills tab moves at once and
 * rolls back if the server refuses.
 */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  const key = ["agent-skills", agentId];
  return useMutation({
    mutationFn: (linkedIds: string[]) =>
      api.post<AgentSkill[]>(`/agents/${agentId}/skills`, { skill_ids: linkedIds }),
    onMutate: async (linkedIds) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentSkill[]>(key);
      if (previous) qc.setQueryData(key, applyLinkOrder(previous, linkedIds));
      return { previous };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (list) => {
      qc.setQueryData(key, list);
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
