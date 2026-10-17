/* hooks/context.ts — React Query hooks for the project context documents:
   GET /repos/:id/context, GET /repos/:id/context/file?path=, and the paths an
   agent or a skill attaches (GET / PUT /agents|skills/:id/context). */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentContext, ProjectContextFile, ProjectContextList, SkillContext } from "@devdigest/shared";
import { api } from "@/lib/api";

/** Query keys for this resource; import these instead of typing the arrays. */
export const contextKeys = {
  list: (repoId: string | null | undefined) => ["context", repoId] as const,
  file: (repoId: string | null | undefined, path: string | null | undefined) =>
    ["context-file", repoId, path] as const,
  /** Prefix of every `file` key — what a save invalidates ("Used by" counts). */
  files: ["context-file"] as const,
  agent: (agentId: string) => ["agent-context", agentId] as const,
  skill: (skillId: string) => ["skill-context", skillId] as const,
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

export function useAgentContext(agentId: string) {
  return useQuery({
    queryKey: contextKeys.agent(agentId),
    queryFn: () => api.get<AgentContext>(`/agents/${agentId}/context`),
    enabled: !!agentId,
  });
}

export function useSkillContext(skillId: string) {
  return useQuery({
    queryKey: contextKeys.skill(skillId),
    queryFn: () => api.get<SkillContext>(`/skills/${skillId}/context`),
    enabled: !!skillId,
  });
}

/**
 * Saves the attached paths of one owner, one `PUT` at a time. `save(paths)` shows
 * the list at once. While a save is in flight the latest list waits (a newer one
 * replaces it) and is sent once after the save succeeds. A failure drops the
 * waiting list and shows the last list the server confirmed; the error toast is
 * the global `MutationCache.onError`. The queue lives in refs: it is not UI.
 */
function useSaveContextPaths(url: string, key: readonly unknown[]) {
  const qc = useQueryClient();
  const inFlight = React.useRef(false);
  const waiting = React.useRef<string[] | null>(null);
  const confirmed = React.useRef<string[] | undefined>(undefined);
  const mutation = useMutation({
    mutationFn: (paths: string[]) => api.put<AgentContext>(url, { paths }),
  });

  const send = async (paths: string[]) => {
    inFlight.current = true;
    try {
      const answer = await mutation.mutateAsync(paths);
      confirmed.current = answer.paths;
      void qc.invalidateQueries({ queryKey: contextKeys.files });
      const next = waiting.current;
      waiting.current = null;
      if (next) return send(next);
      inFlight.current = false;
      qc.setQueryData(key, answer);
    } catch {
      waiting.current = null;
      inFlight.current = false;
      if (confirmed.current) qc.setQueryData(key, { paths: confirmed.current });
      else void qc.invalidateQueries({ queryKey: key });
    }
  };

  const save = (paths: string[]) => {
    if (!inFlight.current) confirmed.current = qc.getQueryData<AgentContext>(key)?.paths;
    qc.setQueryData(key, { paths });
    if (inFlight.current) waiting.current = paths;
    else void send(paths);
  };

  return { save, isPending: mutation.isPending };
}

export function useSetAgentContext(agentId: string) {
  return useSaveContextPaths(`/agents/${agentId}/context`, contextKeys.agent(agentId));
}

export function useSetSkillContext(skillId: string) {
  return useSaveContextPaths(`/skills/${skillId}/context`, contextKeys.skill(skillId));
}
