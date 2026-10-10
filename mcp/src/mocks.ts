import type {
  ApiAgent,
  ApiConventionList,
  ApiPull,
  ApiRepo,
  ApiReview,
  ApiRun,
  DevDigestApi,
} from './ports.js';

// Imported by tests only; the entry and the tools never reference this file.

export interface MockDevDigestApiState {
  agents: ApiAgent[];
  repos: ApiRepo[];
  /** By repo id. */
  pulls: Record<string, ApiPull[]>;
  /** By PR id, newest first. */
  runs: Record<string, ApiRun[]>;
  /** By PR id, newest first. */
  reviews: Record<string, ApiReview[]>;
  /** By repo id. */
  conventions: Record<string, ApiConventionList>;
}

export interface MockDevDigestApiOptions {
  /** Thrown by that method (after the call is recorded). */
  fail?: Partial<Record<keyof DevDigestApi, Error>>;
  /** Default 'run-new'. */
  startedRunId?: string;
  onStart?: (state: Partial<MockDevDigestApiState>, prId: string, agentId: string, runId: string) => void;
  /** Default 'ended'. */
  waitResult?: 'ended' | 'timeout';
  /** Passed to `onEvent`, in order, before `waitForRun` resolves. */
  events?: string[];
  /** Where a test finishes or fails the run. */
  onWait?: (state: Partial<MockDevDigestApiState>, runId: string) => void;
}

const emptyConventions = (): ApiConventionList => ({
  scan: { last_scan_at: null, sampled_files: null },
  candidates: [],
});

/** An in-memory `DevDigestApi`: a missing state key reads as empty, and every call is recorded. */
export class MockDevDigestApi implements DevDigestApi {
  readonly calls: { method: keyof DevDigestApi; args: unknown[] }[] = [];
  readonly state: Partial<MockDevDigestApiState>;
  private readonly opts: MockDevDigestApiOptions;

  constructor(state: Partial<MockDevDigestApiState> = {}, opts: MockDevDigestApiOptions = {}) {
    this.state = state;
    this.opts = opts;
  }

  private record(method: keyof DevDigestApi, args: unknown[]): void {
    this.calls.push({ method, args });
    const failure = this.opts.fail?.[method];
    if (failure) throw failure;
  }

  async listAgents(): Promise<ApiAgent[]> {
    this.record('listAgents', []);
    return this.state.agents ?? [];
  }

  async listRepos(): Promise<ApiRepo[]> {
    this.record('listRepos', []);
    return this.state.repos ?? [];
  }

  async listPulls(repoId: string): Promise<ApiPull[]> {
    this.record('listPulls', [repoId]);
    return this.state.pulls?.[repoId] ?? [];
  }

  async listRuns(prId: string): Promise<ApiRun[]> {
    this.record('listRuns', [prId]);
    return this.state.runs?.[prId] ?? [];
  }

  async listReviews(prId: string): Promise<ApiReview[]> {
    this.record('listReviews', [prId]);
    return this.state.reviews?.[prId] ?? [];
  }

  async getConventions(repoId: string): Promise<ApiConventionList> {
    this.record('getConventions', [repoId]);
    return this.state.conventions?.[repoId] ?? emptyConventions();
  }

  async startReview(prId: string, agentId: string): Promise<{ run_id: string }> {
    this.record('startReview', [prId, agentId]);
    const runId = this.opts.startedRunId ?? 'run-new';
    this.opts.onStart?.(this.state, prId, agentId, runId);
    return { run_id: runId };
  }

  async waitForRun(
    runId: string,
    opts: { timeoutMs: number; signal?: AbortSignal; onEvent?: (message: string) => void },
  ): Promise<'ended' | 'timeout'> {
    this.record('waitForRun', [runId, opts]);
    for (const event of this.opts.events ?? []) opts.onEvent?.(event);
    this.opts.onWait?.(this.state, runId);
    return this.opts.waitResult ?? 'ended';
  }
}
