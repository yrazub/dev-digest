import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MAX_AGENT_NAME, MAX_ID, MAX_PROGRESS_TEXT, MAX_REPO } from '../src/constants.js';
import { createMcpServer } from '../src/server.js';
import { MockDevDigestApi, type MockDevDigestApiOptions, type MockDevDigestApiState } from '../src/mocks.js';
import { ApiError, type ApiAgent, type ApiFinding, type ApiReview, type ApiRun } from '../src/ports.js';
import { executeTool, type ToolContext, type ToolDef, type ToolDeps } from '../src/tool.js';
import { runAgentOnPr } from '../src/tools/run-agent-on-pr.js';

// run_agent_on_pr through `executeTool`, the one path every tool takes, against the in-memory API.
// The mock finishes or fails the run where a test says so (`onWait`), so every case reads the final
// status from the second `listRuns`, the way the tool does.

const REPO = { id: 'repo-1', full_name: 'acme/payments-api' };
const PR = { id: 'pr-482', number: 482 };
const SECURITY = agent({ id: 'agent-sec', name: 'Security Reviewer' });
const GENERAL = agent({ id: 'agent-gen', name: 'General Reviewer' });
const RUN_ID = 'run-new';

const def = runAgentOnPr as unknown as ToolDef;
const json = (text: string) => JSON.parse(text) as Record<string, any>;

function agent(over: Partial<ApiAgent> = {}): ApiAgent {
  return {
    id: 'agent-1',
    name: 'Security Reviewer',
    description: 'Flags secrets.',
    provider: 'openai',
    model: 'gpt-4.1',
    enabled: true,
    ...over,
  };
}

function finding(over: Partial<ApiFinding> = {}): ApiFinding {
  return {
    severity: 'CRITICAL',
    title: 'Hardcoded Stripe secret key',
    file: 'src/config.ts',
    start_line: 11,
    end_line: 11,
    rationale: 'A live key is committed.',
    dismissed_at: null,
    ...over,
  };
}

function review(over: Partial<ApiReview> = {}): ApiReview {
  return {
    run_id: RUN_ID,
    agent_name: 'Security Reviewer',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'A secret was committed.',
    score: 42,
    created_at: '2026-10-10T09:00:00.000Z',
    findings: [finding(), finding({ severity: 'WARNING', title: 'Weak rate limit', file: 'src/rl.ts', start_line: 3, end_line: 5 })],
    ...over,
  };
}

function run(over: Partial<ApiRun> = {}): ApiRun {
  return { run_id: RUN_ID, agent_id: SECURITY.id, agent_name: 'Security Reviewer', status: 'running', error: null, ...over };
}

/** A repo with one imported PR and two agents, plus whatever the case adds. */
function base(extra: Partial<MockDevDigestApiState> = {}): Partial<MockDevDigestApiState> {
  return { repos: [REPO], pulls: { [REPO.id]: [PR] }, agents: [SECURITY, GENERAL], ...extra };
}

/** The API as it behaves for a run that starts and ends in `finalRun`: `startReview` inserts it running. */
function finishing(
  finalRun: Partial<ApiRun>,
  reviews: ApiReview[] | null = [review()],
  extra: Partial<MockDevDigestApiOptions> = {},
): MockDevDigestApiOptions {
  return {
    onStart: (state, prId, agentId, runId) => {
      state.runs = { ...state.runs, [prId]: [run({ run_id: runId, agent_id: agentId }), ...(state.runs?.[prId] ?? [])] };
    },
    onWait: (state, runId) => {
      const runs = state.runs?.[PR.id] ?? [];
      state.runs = { ...state.runs, [PR.id]: runs.map((r) => (r.run_id === runId ? { ...r, ...finalRun } : r)) };
      if (reviews) state.reviews = { ...state.reviews, [PR.id]: [...reviews, ...(state.reviews?.[PR.id] ?? [])] };
    },
    ...extra,
  };
}

async function call(
  args: unknown,
  state: Partial<MockDevDigestApiState>,
  opts: MockDevDigestApiOptions = {},
  more: { ctx?: ToolContext; waitMs?: number } = {},
) {
  const api = new MockDevDigestApi(state, opts);
  const deps: ToolDeps = {
    api,
    config: { apiUrl: 'http://127.0.0.1:3001', waitMs: more.waitMs ?? 120_000 },
    log: vi.fn(),
  };
  const result = await executeTool(def, args, deps, more.ctx);
  const content = result.content as Array<{ type: string; text: string }>;
  expect(content).toHaveLength(1);
  expect(content[0]?.type).toBe('text');
  const text = content[0]?.text ?? '';
  return { api, text, isError: result.isError === true, methods: api.calls.map((c) => c.method) };
}

const ARGS = { repo: 'acme/payments-api', pr: 482, agent: 'agent-sec' };

describe('run_agent_on_pr: the happy path', () => {
  it('resolves repo, PR and agent, starts one run, waits, reads the run and the reviews, in that order', async () => {
    const { api, methods, isError } = await call(ARGS, base(), finishing({ status: 'done' }));

    expect(isError).toBe(false);
    expect(methods).toEqual([
      'listRepos',
      'listPulls',
      'listAgents',
      'listRuns',
      'startReview',
      'waitForRun',
      'listRuns',
      'listReviews',
    ]);
    // The resolved ids went out, not the caller's text.
    expect(api.calls.find((c) => c.method === 'listPulls')?.args).toEqual([REPO.id]);
    expect(api.calls.find((c) => c.method === 'startReview')?.args).toEqual([PR.id, SECURITY.id]);
    expect(api.calls.find((c) => c.method === 'waitForRun')?.args[0]).toBe(RUN_ID);
  });

  it('returns the full review result of the started run, not an older review of the same PR', async () => {
    const older = review({ run_id: 'run-old', verdict: 'approve', score: 99, findings: [] });
    const { text } = await call(ARGS, base({ reviews: { [PR.id]: [older] } }), finishing({ status: 'done' }));

    const body = json(text);
    expect(body).toMatchObject({
      status: 'done',
      run_id: RUN_ID,
      agent: 'Security Reviewer',
      verdict: 'request_changes',
      score: 42,
      summary: 'A secret was committed.',
      counts: { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 },
    });
    expect(body.findings).toEqual([
      { severity: 'CRITICAL', title: 'Hardcoded Stripe secret key', file: 'src/config.ts', line: 11, rationale: 'A live key is committed.' },
      { severity: 'WARNING', title: 'Weak rate limit', file: 'src/rl.ts', line: 3, end_line: 5, rationale: 'A live key is committed.' },
    ]);
    expect(body).not.toHaveProperty('attached');
    expect(body).not.toHaveProperty('truncated');
  });

  it('ignores a kind "summary" record of the started run: the review itself is what is returned', async () => {
    const summary = review({ kind: 'summary', verdict: 'approve', score: 1 });
    const { text } = await call(ARGS, base(), finishing({ status: 'done' }, [review(), summary]));

    expect(json(text).verdict).toBe('request_changes');
  });

  it('bounds the findings at the default limit of 20 and says so', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      finding({ severity: 'SUGGESTION', title: `S${i}`, file: `src/f${String(i).padStart(2, '0')}.ts`, start_line: i + 1, end_line: i + 1 }),
    );
    const { text } = await call(ARGS, base(), finishing({ status: 'done' }, [review({ findings: many })]));

    const body = json(text);
    expect(body.findings).toHaveLength(20);
    expect(body.counts.SUGGESTION).toBe(25);
    expect(body.truncated).toBe(true);
    expect(body.note).toContain('Showing 20 of 25 findings');
  });

  it('accepts the PR number as a numeric string', async () => {
    const { text, isError } = await call({ ...ARGS, pr: '482' }, base(), finishing({ status: 'done' }));

    expect(isError).toBe(false);
    expect(json(text).status).toBe('done');
  });
});

describe('run_agent_on_pr: finding the agent (D20)', () => {
  it('takes the agent by its exact name, with the one listAgents lookup and no other tool call first', async () => {
    const { api, methods, text } = await call({ ...ARGS, agent: 'Security Reviewer' }, base(), finishing({ status: 'done' }));

    expect(json(text).status).toBe('done');
    expect(methods.filter((m) => m === 'listAgents')).toHaveLength(1);
    expect(api.calls.find((c) => c.method === 'startReview')?.args).toEqual([PR.id, SECURITY.id]);
  });

  it('takes the name regardless of case', async () => {
    const { api } = await call({ ...ARGS, agent: 'security reviewer' }, base(), finishing({ status: 'done' }));

    expect(api.calls.find((c) => c.method === 'startReview')?.args).toEqual([PR.id, SECURITY.id]);
  });

  it('answers an unknown agent with E-AGENT-UNKNOWN naming list_agents, and starts and waits for nothing', async () => {
    const { text, isError, methods } = await call({ ...ARGS, agent: 'Nobody' }, base(), finishing({ status: 'done' }));

    expect(isError).toBe(true);
    expect(text).toContain('Agent "Nobody" was not found');
    expect(text).toContain('Call list_agents');
    expect(methods).not.toContain('startReview');
    expect(methods).not.toContain('waitForRun');
  });

  it('answers two agents sharing a name with E-AGENT-AMBIGUOUS listing both ids, and starts nothing', async () => {
    const twin = agent({ id: 'agent-sec-2', name: 'Security Reviewer' });
    const { text, isError, methods } = await call(
      { ...ARGS, agent: 'Security Reviewer' },
      base({ agents: [SECURITY, twin] }),
      finishing({ status: 'done' }),
    );

    expect(isError).toBe(true);
    expect(text).toContain('matches 2 agents');
    expect(text).toContain('Pass the id');
    expect(text).toContain('agent-sec ');
    expect(text).toContain('agent-sec-2');
    expect(methods).not.toContain('startReview');
    expect(methods).not.toContain('waitForRun');
  });
});

describe('run_agent_on_pr: nothing is started when a lookup fails', () => {
  it('unknown repository: E-REPO-UNKNOWN listing the imported ones', async () => {
    const { text, isError, methods } = await call({ ...ARGS, repo: 'acme/other' }, base(), finishing({ status: 'done' }));

    expect(isError).toBe(true);
    expect(text).toContain('is not imported into DevDigest');
    expect(text).toContain('acme/payments-api');
    expect(methods).not.toContain('startReview');
    expect(methods).not.toContain('waitForRun');
  });

  it('a repo that is not owner/name: E-REPO-FORMAT, and not a single API call', async () => {
    const { text, isError, api } = await call({ ...ARGS, repo: 'payments-api' }, base(), finishing({ status: 'done' }));

    expect(isError).toBe(true);
    expect(text).toContain('repo must be "owner/name"');
    expect(api.calls).toEqual([]);
  });

  it('unknown PR: E-PR-UNKNOWN naming the imported numbers, and nothing started', async () => {
    const { text, isError, methods } = await call({ ...ARGS, pr: 9999 }, base(), finishing({ status: 'done' }));

    expect(isError).toBe(true);
    expect(text).toContain('Pull request #9999 is not imported for acme/payments-api');
    expect(text).toContain('#482');
    expect(methods).not.toContain('startReview');
    expect(methods).not.toContain('waitForRun');
  });

  it.each([
    ['pr 0', { ...ARGS, pr: 0 }],
    ['a missing agent', { repo: ARGS.repo, pr: ARGS.pr }],
    ['an unknown key', { ...ARGS, wait: 5 }],
  ])('invalid arguments (%s): E-ARGS naming the tool, no API call', async (_name, args) => {
    const { text, isError, api } = await call(args, base(), finishing({ status: 'done' }));

    expect(isError).toBe(true);
    expect(text).toContain('Invalid arguments for run_agent_on_pr');
    expect(api.calls).toEqual([]);
  });
});

describe('run_agent_on_pr: a run of that agent is already in flight (D9)', () => {
  const inFlight = run({ run_id: 'run-live', agent_id: SECURITY.id, status: 'running' });

  it('does not start a second run: it waits on the live one and says it attached', async () => {
    const { api, methods, text } = await call(
      ARGS,
      base({ runs: { [PR.id]: [inFlight] } }),
      finishing({ status: 'done' }, [review({ run_id: 'run-live' })]),
    );

    expect(methods).not.toContain('startReview');
    expect(api.calls.find((c) => c.method === 'waitForRun')?.args[0]).toBe('run-live');
    const body = json(text);
    expect(body).toMatchObject({ status: 'done', run_id: 'run-live', attached: true });
  });

  it('a running run of another agent does not prevent a start', async () => {
    const other = run({ run_id: 'run-other', agent_id: GENERAL.id, status: 'running' });
    const { api, methods, text } = await call(ARGS, base({ runs: { [PR.id]: [other] } }), finishing({ status: 'done' }));

    expect(methods).toContain('startReview');
    expect(api.calls.find((c) => c.method === 'startReview')?.args).toEqual([PR.id, SECURITY.id]);
    expect(api.calls.find((c) => c.method === 'waitForRun')?.args[0]).toBe(RUN_ID);
    const body = json(text);
    expect(body.run_id).toBe(RUN_ID);
    expect(body).not.toHaveProperty('attached');
  });

  it('a finished run of the same agent does not count as in flight', async () => {
    const finished = run({ run_id: 'run-old', agent_id: SECURITY.id, status: 'done' });
    const { methods } = await call(ARGS, base({ runs: { [PR.id]: [finished] } }), finishing({ status: 'done' }));

    expect(methods).toContain('startReview');
  });
});

describe('run_agent_on_pr: the wait outlasts the budget (D4)', () => {
  const stillRunning = (extra: Partial<MockDevDigestApiOptions> = {}) =>
    finishing({ status: 'running' }, null, { waitResult: 'timeout', ...extra });

  it('answers a non-error status "running" with the run id, the configured wait and a next step naming get_findings', async () => {
    const { text, isError, methods } = await call(ARGS, base(), stillRunning());

    expect(isError).toBe(false);
    const body = json(text);
    expect(body).toMatchObject({ status: 'running', run_id: RUN_ID, agent: 'Security Reviewer', waited_seconds: 120 });
    expect(body.next).toContain('get_findings');
    expect(body.next).toContain('acme/payments-api');
    expect(body.next).toContain('482');
    expect(body.next).toContain(RUN_ID);
    expect(body.next).toContain('Do not call run_agent_on_pr again');
    expect(methods.filter((m) => m === 'startReview')).toHaveLength(1);
    expect(methods).not.toContain('listReviews');
  });

  it('cuts agent at MAX_AGENT_NAME and run_id at MAX_ID, and a normal uuid run id is untouched', async () => {
    const long = agent({ id: 'agent-long', name: 'A'.repeat(300) });
    const cut = await call(
      { ...ARGS, agent: long.id },
      base({ agents: [long] }),
      stillRunning({ startedRunId: 'i'.repeat(300) }),
    );
    const uuid = '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c';
    const plain = await call(ARGS, base(), stillRunning({ startedRunId: uuid }));

    const body = json(cut.text);
    expect(body.status).toBe('running');
    expect(body.agent).toHaveLength(MAX_AGENT_NAME);
    expect(body.agent.endsWith('…')).toBe(true);
    expect(body.run_id).toHaveLength(MAX_ID);
    expect(body.run_id.endsWith('…')).toBe(true);
    expect(json(plain.text).run_id).toBe(uuid);
    expect(json(plain.text).next).toContain(`run_id "${uuid}"`);
  });

  it('cuts the repository and the run id named in next, which still names get_findings, the PR and the run', async () => {
    const longRepo = { id: 'repo-long', full_name: `acme/${'r'.repeat(300)}` };
    const longRun = 'i'.repeat(300);
    const { text } = await call(
      { ...ARGS, repo: longRepo.full_name },
      { ...base(), repos: [longRepo], pulls: { [longRepo.id]: [PR] } },
      stillRunning({ startedRunId: longRun }),
    );

    const { next } = json(text);
    const cutRepo = `acme/${'r'.repeat(MAX_REPO - 'acme/'.length - 1)}…`;
    const cutRun = `${'i'.repeat(MAX_ID - 1)}…`;
    expect(next).toContain('get_findings');
    expect(next).toContain(`repo "${cutRepo}"`);
    expect(next).toContain('pr 482');
    expect(next).toContain(`run_id "${cutRun}"`);
    expect(next).not.toContain('r'.repeat(MAX_REPO));
    expect(next).not.toContain('i'.repeat(MAX_ID));
  });

  it('reports waited_seconds from the configured wait', async () => {
    const { text, api } = await call(ARGS, base(), stillRunning(), { waitMs: 45_000 });

    expect(json(text).waited_seconds).toBe(45);
    expect((api.calls.find((c) => c.method === 'waitForRun')?.args[1] as { timeoutMs: number }).timeoutMs).toBe(45_000);
  });

  it('treats a status that is neither done, failed nor cancelled as still running', async () => {
    const { text, isError } = await call(ARGS, base(), finishing({ status: 'queued' }, null));

    expect(isError).toBe(false);
    expect(json(text)).toMatchObject({ status: 'running', run_id: RUN_ID });
  });

  it('a retry after that answer attaches to the run instead of paying twice', async () => {
    const first = await call(ARGS, base(), stillRunning());
    expect(json(first.text).status).toBe('running');

    // The API now holds the run the first call started, still going.
    const { methods, text } = await call(
      ARGS,
      base({ runs: { [PR.id]: [run({ run_id: RUN_ID, status: 'running' })] } }),
      finishing({ status: 'done' }),
    );
    expect(methods).not.toContain('startReview');
    expect(json(text)).toMatchObject({ status: 'done', run_id: RUN_ID, attached: true });
  });
});

describe('run_agent_on_pr: the run ends without a result', () => {
  it('failed with a token-like string in the error: E-RUN-FAILED with the string masked', async () => {
    const secret = `sk-${'a1B2c3D4'.repeat(4)}`;
    const { text, isError } = await call(
      ARGS,
      base(),
      finishing({ status: 'failed', error: `401 Incorrect API key provided: ${secret}` }, null),
    );

    expect(isError).toBe(true);
    expect(text).toContain(`Run ${RUN_ID} (Security Reviewer) failed`);
    expect(text).toContain('Incorrect API key provided: ***');
    expect(text).not.toContain(secret);
    expect(text).toContain('call run_agent_on_pr again');
  });

  it('failed with a null error: says that no error was recorded', async () => {
    const { text, isError } = await call(ARGS, base(), finishing({ status: 'failed', error: null }, null));

    expect(isError).toBe(true);
    expect(text).toContain('no error was recorded; the API may have restarted during the run');
  });

  it('cancelled: E-RUN-CANCELLED, pointing at a new run_agent_on_pr', async () => {
    const { text, isError } = await call(ARGS, base(), finishing({ status: 'cancelled' }, null));

    expect(isError).toBe(true);
    expect(text).toContain(`Run ${RUN_ID} (Security Reviewer) was cancelled in DevDigest`);
    expect(text).toContain('Call run_agent_on_pr to start a new one');
  });

  it('done but with no review stored: E-RUN-NO-REVIEW', async () => {
    const { text, isError } = await call(ARGS, base(), finishing({ status: 'done' }, null));

    expect(isError).toBe(true);
    expect(text).toContain(`Run ${RUN_ID} finished but its review is no longer stored`);
    expect(text).toContain('Call run_agent_on_pr');
  });

  it('done, with only a review of another run: E-RUN-NO-REVIEW, never that other review', async () => {
    const { text, isError } = await call(ARGS, base(), finishing({ status: 'done' }, [review({ run_id: 'run-old' })]));

    expect(isError).toBe(true);
    expect(text).toContain('no longer stored');
  });

  it('the run row is gone after the wait: E-RUN-NO-REVIEW', async () => {
    const vanishing: MockDevDigestApiOptions = {
      onWait: (state) => {
        state.runs = { [PR.id]: [] };
      },
    };
    const { text, isError } = await call(ARGS, base(), vanishing);

    expect(isError).toBe(true);
    expect(text).toContain(`Run ${RUN_ID} finished but its review is no longer stored`);
  });
});

describe('run_agent_on_pr: API failures', () => {
  it('startReview answered 429: E-API-RATE telling to wait 60 seconds, and no wait', async () => {
    const limited = new ApiError('http', 'POST /pulls/:id/review', 429, 'rate_limited', 'Too many requests');
    const { text, isError, methods } = await call(ARGS, base(), { fail: { startReview: limited } });

    expect(isError).toBe(true);
    expect(text).toContain('rate limit');
    expect(text).toContain('POST /pulls/:id/review');
    expect(text).toContain('Wait 60 seconds');
    expect(methods).not.toContain('waitForRun');
  });

  it('an unreachable API is E-API-UNREACHABLE naming the URL and ./scripts/dev.sh', async () => {
    const down = new ApiError('unreachable', 'GET /repos');
    const { text, isError } = await call(ARGS, base(), { fail: { listRepos: down } });

    expect(isError).toBe(true);
    expect(text).toContain('not reachable at http://127.0.0.1:3001');
    expect(text).toContain('./scripts/dev.sh');
  });

  it('the second listRuns failing after the wait is reported as an API error, not a crash', async () => {
    let calls = 0;
    const api = new MockDevDigestApi(base(), finishing({ status: 'done' }));
    const original = api.listRuns.bind(api);
    api.listRuns = async (prId: string) => {
      calls += 1;
      if (calls === 2) throw new ApiError('timeout', 'GET /pulls/:id/runs');
      return original(prId);
    };
    const deps: ToolDeps = { api, config: { apiUrl: 'http://127.0.0.1:3001', waitMs: 120_000 }, log: vi.fn() };

    const result = await executeTool(def, ARGS, deps);

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain('did not answer GET /pulls/:id/runs');
  });
});

describe('run_agent_on_pr: progress, the wait and the signal', () => {
  it('forwards the events of the wait to ctx.progress, in order', async () => {
    const progress = vi.fn();
    await call(ARGS, base(), finishing({ status: 'done' }, [review()], { events: ['queued', 'reading the diff', 'grounding'] }), {
      ctx: { progress },
    });

    expect(progress.mock.calls.map((c) => c[0])).toEqual(['queued', 'reading the diff', 'grounding']);
  });

  it('a cancelled call masks a token-like run id and caps a long one in its text', async () => {
    const token = 'ghp_abcdefghijklmnop1234';
    const controller = new AbortController();
    const masked = await call(ARGS, base(), finishing({ status: 'done' }, [review()], { startedRunId: token, onWait: () => controller.abort() }), {
      ctx: { signal: controller.signal },
    });
    const controller2 = new AbortController();
    const capped = await call(ARGS, base(), finishing({ status: 'done' }, [review()], { startedRunId: 'i'.repeat(1_000), onWait: () => controller2.abort() }), {
      ctx: { signal: controller2.signal },
    });

    expect(masked.isError).toBe(true);
    expect(masked.text).toBe('The call was cancelled. Run *** was not stopped; read it later with get_findings.');
    expect(capped.isError).toBe(true);
    expect(capped.text).not.toContain('i'.repeat(300));
    expect(capped.text).toContain('…');
    expect(capped.text).toContain('get_findings');
  });

  it('waits with the default 120,000 ms and the context signal', async () => {
    const controller = new AbortController();
    const { api } = await call(ARGS, base(), finishing({ status: 'done' }), { ctx: { signal: controller.signal } });

    const opts = api.calls.find((c) => c.method === 'waitForRun')?.args[1] as { timeoutMs: number; signal?: AbortSignal };
    expect(opts.timeoutMs).toBe(120_000);
    expect(opts.signal).toBe(controller.signal);
  });

  it('waits for the configured number of milliseconds', async () => {
    const { api } = await call(ARGS, base(), finishing({ status: 'done' }), { waitMs: 30_000 });

    expect((api.calls.find((c) => c.method === 'waitForRun')?.args[1] as { timeoutMs: number }).timeoutMs).toBe(30_000);
  });

  it('a call cancelled by its client ends with an error naming the run and get_findings, and reads and cancels nothing more', async () => {
    const controller = new AbortController();
    const { text, isError, methods } = await call(
      ARGS,
      base(),
      finishing({ status: 'done' }, [review()], { onWait: () => controller.abort() }),
      { ctx: { signal: controller.signal } },
    );

    expect(isError).toBe(true);
    expect(text).toContain(RUN_ID);
    expect(text).toContain('get_findings');
    // The last call is the wait: no second listRuns, no review read, and the run is not touched.
    expect(methods[methods.length - 1]).toBe('waitForRun');
    expect(methods.filter((m) => m === 'startReview')).toHaveLength(1);
  });
});

// The path from a run event to the client: `server.ts` masks and caps each message before it
// sends `notifications/progress`. Driven through the SDK's in-memory transport pair: the real
// `createMcpServer` and a real `Client`, in one process, with no spawned process and no port.
describe('run_agent_on_pr: progress notifications through the server', () => {
  async function callWithEvents(events: string[], options: { withToken: boolean }) {
    const api = new MockDevDigestApi(base(), finishing({ status: 'done' }, [review()], { events }));
    const server = createMcpServer({
      api,
      config: { apiUrl: 'http://127.0.0.1:3001', waitMs: 120_000 },
      log: vi.fn(),
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const received: Array<{ progress: number; message?: string }> = [];
    // The client reports a progress notification it has no handler for ("unknown token") here, so
    // a notification sent without a token would show up as an error rather than vanish.
    const clientErrors: Error[] = [];
    client.onerror = (error) => clientErrors.push(error);
    try {
      await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
      const result = await client.callTool(
        { name: 'run_agent_on_pr', arguments: ARGS },
        undefined,
        options.withToken ? { onprogress: (p) => received.push(p) } : undefined,
      );
      return { received, result, clientErrors };
    } finally {
      await client.close();
      await server.close();
    }
  }

  it('masks, collapses and caps each message; an ordinary one arrives unchanged', async () => {
    const token = 'ghp_abcdefghijklmnop1234';
    const { received, result } = await callWithEvents(
      ['reading the diff', 'first line\nsecond   line\r\n\tthird', `using ${token} to push`, 'L'.repeat(1_000)],
      { withToken: true },
    );

    expect(result.isError).not.toBe(true);
    expect(received.map((p) => p.progress)).toEqual([1, 2, 3, 4]);
    const messages = received.map((p) => p.message ?? '');
    expect(messages[0]).toBe('reading the diff');
    expect(messages[1]).toBe('first line second line third');
    expect(messages[2]).toBe('using *** to push');
    expect(messages[2]).not.toContain(token);
    expect(messages[3]).toHaveLength(MAX_PROGRESS_TEXT);
    expect(messages[3]?.endsWith('…')).toBe(true);
    for (const message of messages) expect(message).not.toMatch(/[\r\n\t]/);
  });

  it('masks a token before the cut, so a token that straddles the cap leaves no prefix behind', async () => {
    const token = 'ghp_' + 'a'.repeat(40);
    const filler = 'x'.repeat(MAX_PROGRESS_TEXT - 10);
    const { received } = await callWithEvents([`${filler} ${token}`], { withToken: true });

    const message = received[0]?.message ?? '';
    expect(message).toBe(`${filler} ***`);
    expect(message).not.toContain('ghp_');
  });

  it('sends no notification when the call carries no progress token, and the call still succeeds', async () => {
    const { received, result, clientErrors } = await callWithEvents(['reading the diff', 'grounding'], { withToken: false });

    expect(received).toEqual([]);
    expect(clientErrors).toEqual([]);
    expect(result.isError).not.toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]?.text ?? '{}')).toMatchObject({ status: 'done', run_id: RUN_ID });
  });
});
