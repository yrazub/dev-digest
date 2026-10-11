import { z } from 'zod';
import {
  Agent,
  ConventionCandidate,
  ConventionList,
  FindingRecord,
  PrMeta,
  Repo,
  ReviewRecord,
  RunSummary,
} from '@devdigest/shared';

// ---- API views: only the fields the tools use, each derived from a shared contract ----

export const ApiAgent = Agent.pick({
  id: true,
  name: true,
  description: true,
  provider: true,
  model: true,
  enabled: true,
});
export type ApiAgent = z.infer<typeof ApiAgent>;

export const ApiRepo = Repo.pick({ id: true, full_name: true });
export type ApiRepo = z.infer<typeof ApiRepo>;

export const ApiPull = PrMeta.pick({ id: true, number: true });
export type ApiPull = z.infer<typeof ApiPull>;

export const ApiRun = RunSummary.pick({
  run_id: true,
  agent_id: true,
  agent_name: true,
  status: true,
  error: true,
});
export type ApiRun = z.infer<typeof ApiRun>;

export const ApiFinding = FindingRecord.pick({
  severity: true,
  title: true,
  file: true,
  start_line: true,
  end_line: true,
  rationale: true,
  dismissed_at: true,
});
export type ApiFinding = z.infer<typeof ApiFinding>;

export const ApiReview = ReviewRecord.pick({
  run_id: true,
  agent_name: true,
  kind: true,
  verdict: true,
  summary: true,
  score: true,
  created_at: true,
}).extend({ findings: z.array(ApiFinding) });
export type ApiReview = z.infer<typeof ApiReview>;

export const ApiConvention = ConventionCandidate.pick({
  category: true,
  rule: true,
  evidence_path: true,
  evidence_line_start: true,
  evidence_line_end: true,
  status: true,
});
export type ApiConvention = z.infer<typeof ApiConvention>;

export const ApiConventionList = ConventionList.extend({ candidates: z.array(ApiConvention) });
export type ApiConventionList = z.infer<typeof ApiConventionList>;

// ---- Errors ----

export type ApiErrorKind = 'unreachable' | 'timeout' | 'http' | 'invalid_response';

/** A failure at the HTTP boundary. `route` is an `API_ROUTES` value, e.g. 'GET /pulls/:id/reviews'. */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly route: string,
    readonly status?: number,
    readonly code?: string,
    message?: string,
  ) {
    super(message ?? `${kind}: ${route}`);
    this.name = 'ApiError';
  }
}

// ---- The port ----

export interface DevDigestApi {
  listAgents(): Promise<ApiAgent[]>;
  listRepos(): Promise<ApiRepo[]>;
  listPulls(repoId: string): Promise<ApiPull[]>;
  /** Newest first. */
  listRuns(prId: string): Promise<ApiRun[]>;
  /** Newest first. */
  listReviews(prId: string): Promise<ApiReview[]>;
  getConventions(repoId: string): Promise<ApiConventionList>;
  /** Body `{ agentId }`. */
  startReview(prId: string, agentId: string): Promise<{ run_id: string }>;
  /** Waits on the run's SSE stream. Never throws. */
  waitForRun(
    runId: string,
    opts: { timeoutMs: number; signal?: AbortSignal; onEvent?: (message: string) => void },
  ): Promise<'ended' | 'timeout'>;
}

/**
 * The allow-list: everything this process can ask the API for. Seven reads and one write.
 * A route that is not here cannot be reached from a tool.
 */
export const API_ROUTES = {
  listAgents: 'GET /agents',
  listRepos: 'GET /repos',
  listPulls: 'GET /repos/:id/pulls',
  listRuns: 'GET /pulls/:id/runs',
  listReviews: 'GET /pulls/:id/reviews',
  getConventions: 'GET /repos/:id/conventions',
  startReview: 'POST /pulls/:id/review',
  waitForRun: 'GET /runs/:id/events',
} as const satisfies Record<keyof DevDigestApi, string>;
