/* hooks/evals.ts — React Query hooks for the L06 eval pipeline: an agent's eval cases, its
   suite runs, one run with its per-case results, and the cross-agent overview.
   A run executes in the background on the server, so the run-reading hooks poll every 2 s
   while the latest data holds a `running` run (a remount resumes, the state is the server's),
   and invalidate the dependent keys when a run they saw `running` comes back `done` or `failed`. */
"use client";

import React from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalCaseCreateResponse,
  EvalCaseList,
  EvalOverview,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  EvalSuiteRunList,
} from "@devdigest/shared";

export const evalKeys = {
  cases: (agentId: string | null | undefined) => ["eval-cases", agentId] as const,
  runs: (agentId: string | null | undefined, limit?: number) =>
    limit === undefined ? (["eval-runs", agentId] as const) : (["eval-runs", agentId, limit] as const),
  run: (runId: string | null | undefined) => ["eval-run", runId] as const,
  overview: () => ["eval-overview"] as const,
};

const POLL_MS = 2000;

type RunLike = Pick<EvalSuiteRun, "id" | "agent_id" | "status">;

const isRunning = (r: RunLike) => r.status === "running";

/** The run rows each query's data carries; the polling rule and the completion rule read them. */
const runsOfList = (d: EvalSuiteRunList | undefined): readonly RunLike[] => d?.runs ?? [];
const runsOfDetail = (d: EvalSuiteRunDetail | undefined): readonly RunLike[] => (d ? [d] : []);
const runsOfOverview = (d: EvalOverview | undefined): readonly RunLike[] => d?.recent_runs ?? [];

/** 2,000 ms while the latest data holds a running run, else off (R-WEB-20). */
function pollWhileRunning<T>(runsOf: (d: T | undefined) => readonly RunLike[], extra?: (d: T) => boolean) {
  return (query: { state: { data: T | undefined } }): number | false => {
    const data = query.state.data;
    if (data === undefined) return false;
    return runsOf(data).some(isRunning) || extra?.(data) === true ? POLL_MS : false;
  };
}

/** R-WEB-21: for each run id last seen `running` that is now `done` or `failed`, invalidate the
    four keys. The ref is read and written in the effect only. */
function useInvalidateOnCompletion<T>(data: T | undefined, runsOf: (d: T | undefined) => readonly RunLike[]) {
  const qc = useQueryClient();
  const seenRunning = React.useRef<ReadonlySet<string>>(new Set());
  React.useEffect(() => {
    const runs = runsOf(data);
    const stillRunning = new Set<string>();
    for (const run of runs) {
      if (isRunning(run)) {
        stillRunning.add(run.id);
      } else if (seenRunning.current.has(run.id)) {
        void qc.invalidateQueries({ queryKey: evalKeys.runs(run.agent_id) });
        void qc.invalidateQueries({ queryKey: evalKeys.run(run.id) });
        void qc.invalidateQueries({ queryKey: evalKeys.overview() });
        void qc.invalidateQueries({ queryKey: evalKeys.cases(run.agent_id) });
      }
    }
    seenRunning.current = stillRunning;
  }, [data, runsOf, qc]);
}

export function useAgentEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.cases(agentId),
    queryFn: () => api.get<EvalCaseList>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

/** Turn a decided finding into an eval case; `mutate(findingId)`. 201 and 200 both resolve. */
export function useCreateEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => api.post<EvalCaseCreateResponse>(`/findings/${findingId}/eval-case`),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalKeys.cases(agentId) }),
  });
}

/** Delete one case; `mutate(caseId)`. */
export function useDeleteEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<void>(`/eval-cases/${caseId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: evalKeys.cases(agentId) }),
  });
}

/** Newest first. "Show more" raises `limit`; the previous page stays on screen meanwhile. */
export function useAgentEvalRuns(agentId: string | null | undefined, limit: number) {
  const query = useQuery({
    queryKey: evalKeys.runs(agentId, limit),
    queryFn: () => api.get<EvalSuiteRunList>(`/agents/${agentId}/eval-runs?limit=${limit}&offset=0`),
    enabled: !!agentId,
    placeholderData: keepPreviousData,
    refetchInterval: pollWhileRunning(runsOfList),
  });
  useInvalidateOnCompletion(query.data, runsOfList);
  return query;
}

/** Start a background run; `mutate()`. The server answers 202 with the `running` row. */
export function useStartEvalRun(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalSuiteRun>(`/agents/${agentId}/eval-runs`),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: evalKeys.runs(agentId) }),
        qc.invalidateQueries({ queryKey: evalKeys.overview() }),
      ]);
    },
  });
}

export function useEvalRun(runId: string | null | undefined) {
  const query = useQuery({
    queryKey: evalKeys.run(runId),
    queryFn: () => api.get<EvalSuiteRunDetail>(`/eval-runs/${runId}`),
    enabled: !!runId,
    refetchInterval: pollWhileRunning(runsOfDetail),
  });
  useInvalidateOnCompletion(query.data, runsOfDetail);
  return query;
}

export function useEvalOverview() {
  const query = useQuery({
    queryKey: evalKeys.overview(),
    queryFn: () => api.get<EvalOverview>("/evals/overview"),
    refetchInterval: pollWhileRunning(runsOfOverview, (d: EvalOverview) => d.agents.some((a) => a.running)),
  });
  useInvalidateOnCompletion(query.data, runsOfOverview);
  return query;
}
