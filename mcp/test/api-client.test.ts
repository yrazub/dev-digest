import { describe, expect, it, vi } from 'vitest';
import { API_ROUTES, ApiError, type DevDigestApi } from '../src/ports.js';
import { HttpDevDigestApi } from '../src/api-client.js';

// Hermetic: the client is built with a stub `fetch`; nothing here touches the network.

const BASE = 'http://api.test:3001';

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

type Handler = (seen: Seen, init: RequestInit) => Response | Promise<Response>;

function stubFetch(handler: Handler): { fetch: typeof fetch; seen: Seen[]; spy: ReturnType<typeof vi.fn> } {
  const seen: Seen[] = [];
  const spy = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const entry: Seen = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: typeof init.body === 'string' ? init.body : undefined,
    };
    seen.push(entry);
    return handler(entry, init);
  });
  return { fetch: spy as unknown as typeof fetch, seen, spy };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function clientWith(handler: Handler, extra: { requestTimeoutMs?: number } = {}) {
  const stub = stubFetch(handler);
  const api = new HttpDevDigestApi({ baseUrl: BASE, fetch: stub.fetch, ...extra });
  return { api, ...stub };
}

/** The ApiError a promise rejects with; fails the test when it resolves or rejects with anything else. */
async function failure(promise: Promise<unknown>): Promise<ApiError> {
  let caught: unknown;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(ApiError);
  return caught as ApiError;
}

// ---- Fixtures: bodies the API would send, with fields the views drop ----

const agentBody = {
  id: 'agent-1',
  name: 'Security reviewer',
  description: 'Finds security issues',
  provider: 'anthropic',
  model: 'claude-x',
  system_prompt: 'You are a reviewer. SECRET PROMPT TEXT.',
  enabled: true,
  version: 3,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
  skill_count: 2,
};

const repoBody = {
  id: 'repo-1',
  workspace_id: 'ws-1',
  owner: 'acme',
  name: 'payments-api',
  full_name: 'acme/payments-api',
  default_branch: 'main',
  clone_path: '/some/where',
  last_polled_at: null,
  created_by: null,
};

const pullBody = { id: 'pr-1', number: 7, title: 'Add retries', author: 'sam', status: 'open' };

const runBody = {
  run_id: 'run-1',
  agent_id: 'agent-1',
  agent_name: 'Security reviewer',
  provider: 'anthropic',
  model: 'claude-x',
  status: 'done',
  error: null,
  duration_ms: 1200,
};

const reviewBody = {
  id: 'rev-1',
  pr_id: 'pr-1',
  run_id: 'run-1',
  agent_name: 'Security reviewer',
  kind: 'review',
  verdict: 'request_changes',
  summary: 'Two problems.',
  score: 61,
  model: 'claude-x',
  created_at: '2026-01-01T00:00:00Z',
  findings: [
    {
      id: 'f-1',
      review_id: 'rev-1',
      severity: 'WARNING',
      category: 'security',
      title: 'Unvalidated input',
      file: 'src/a.ts',
      start_line: 3,
      end_line: 5,
      rationale: 'Because.',
      confidence: 0.9,
      accepted_at: null,
      dismissed_at: null,
    },
  ],
};

const conventionsBody = {
  scan: { last_scan_at: null, sampled_files: null },
  candidates: [
    {
      id: 'c-1',
      category: 'naming',
      rule: 'Files are kebab-case.',
      evidence_path: 'src/a-b.ts',
      evidence_line_start: 1,
      evidence_line_end: 2,
      evidence_snippet: 'x',
      evidence_url: null,
      confidence: 0.8,
      status: 'accepted',
    },
  ],
};

const startedBody = {
  pr_id: 'pr-1',
  runs: [{ run_id: 'run-9', agent_id: 'agent-1', agent_name: 'Security reviewer' }],
  reviews: [],
};

// ---- SSE helpers ----

const encoder = new TextEncoder();

function runEvent(seq: number, msg: string): string {
  const data = { runId: 'run-9', seq, kind: 'info', msg, t: '00.0' + seq };
  return `id: ${seq}\nevent: run\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A body that delivers `bytes` in pieces of `size` and then closes. */
function chunkedBody(text: string, size: number): ReadableStream<Uint8Array> {
  const bytes = encoder.encode(text);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    },
  });
}

/** A body that delivers `parts` and then stays open until it is cancelled. */
function openBody(parts: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
    },
  });
}

const sse = (body: ReadableStream<Uint8Array>, status = 200): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });

/** A fetch that never answers; it rejects with the signal's reason when the signal aborts. */
const hang: Handler = (_seen, init) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  });

// ---------------------------------------------------------------------------

describe('the request methods', () => {
  const cases: Array<{
    name: string;
    call: (api: HttpDevDigestApi) => Promise<unknown>;
    route: string;
    path: string;
    body: unknown;
  }> = [
    { name: 'listAgents', call: (a) => a.listAgents(), route: API_ROUTES.listAgents, path: '/agents', body: [agentBody] },
    { name: 'listRepos', call: (a) => a.listRepos(), route: API_ROUTES.listRepos, path: '/repos', body: [repoBody] },
    {
      name: 'listPulls',
      call: (a) => a.listPulls('repo-1'),
      route: API_ROUTES.listPulls,
      path: '/repos/repo-1/pulls',
      body: [pullBody],
    },
    {
      name: 'listRuns',
      call: (a) => a.listRuns('pr-1'),
      route: API_ROUTES.listRuns,
      path: '/pulls/pr-1/runs',
      body: [runBody],
    },
    {
      name: 'listReviews',
      call: (a) => a.listReviews('pr-1'),
      route: API_ROUTES.listReviews,
      path: '/pulls/pr-1/reviews',
      body: [reviewBody],
    },
    {
      name: 'getConventions',
      call: (a) => a.getConventions('repo-1'),
      route: API_ROUTES.getConventions,
      path: '/repos/repo-1/conventions',
      body: conventionsBody,
    },
    {
      name: 'startReview',
      call: (a) => a.startReview('pr-1', 'agent-1'),
      route: API_ROUTES.startReview,
      path: '/pulls/pr-1/review',
      body: startedBody,
    },
  ];

  it.each(cases)('$name sends the method and path of its API_ROUTES entry under baseUrl', async (c) => {
    const { api, seen } = clientWith(() => json(c.body));

    await c.call(api);

    expect(seen).toHaveLength(1);
    expect(`${seen[0]?.method} ${seen[0]?.url}`).toBe(`${c.route.split(' ')[0]} ${BASE}${c.path}`);
  });

  it('sends a read as a GET with no body and no content-type', async () => {
    const { api, seen } = clientWith(() => json([repoBody]));

    await api.listRepos();

    expect(seen[0]?.method).toBe('GET');
    expect(seen[0]?.body).toBeUndefined();
    expect(seen[0]?.headers['content-type']).toBeUndefined();
  });

  it('listAgents returns only the six picked fields when the body also carries system_prompt', async () => {
    const { api } = clientWith(() => json([agentBody]));

    const agents = await api.listAgents();

    expect(agents).toEqual([
      {
        id: 'agent-1',
        name: 'Security reviewer',
        description: 'Finds security issues',
        provider: 'anthropic',
        model: 'claude-x',
        enabled: true,
      },
    ]);
    expect(JSON.stringify(agents)).not.toContain('SECRET PROMPT TEXT');
  });

  it('listRepos, listPulls and listRuns return their picked fields', async () => {
    expect(await clientWith(() => json([repoBody])).api.listRepos()).toEqual([
      { id: 'repo-1', full_name: 'acme/payments-api' },
    ]);
    expect(await clientWith(() => json([pullBody])).api.listPulls('repo-1')).toEqual([{ id: 'pr-1', number: 7 }]);
    expect(await clientWith(() => json([runBody])).api.listRuns('pr-1')).toEqual([
      { run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Security reviewer', status: 'done', error: null },
    ]);
  });

  it('listReviews keeps the review fields and the finding fields the tools use, and nothing else', async () => {
    const { api } = clientWith(() => json([reviewBody]));

    const [review] = await api.listReviews('pr-1');

    expect(review).toEqual({
      run_id: 'run-1',
      agent_name: 'Security reviewer',
      kind: 'review',
      verdict: 'request_changes',
      summary: 'Two problems.',
      score: 61,
      created_at: '2026-01-01T00:00:00Z',
      findings: [
        {
          severity: 'WARNING',
          title: 'Unvalidated input',
          file: 'src/a.ts',
          start_line: 3,
          end_line: 5,
          rationale: 'Because.',
          dismissed_at: null,
        },
      ],
    });
  });

  it('getConventions returns the scan info and the picked candidate fields', async () => {
    const { api } = clientWith(() => json(conventionsBody));

    expect(await api.getConventions('repo-1')).toEqual({
      scan: { last_scan_at: null, sampled_files: null },
      candidates: [
        {
          category: 'naming',
          rule: 'Files are kebab-case.',
          evidence_path: 'src/a-b.ts',
          evidence_line_start: 1,
          evidence_line_end: 2,
          status: 'accepted',
        },
      ],
    });
  });

  it('percent-encodes an id that contains a slash or a space in the path', async () => {
    const { api, seen } = clientWith(() => json([pullBody]));

    await api.listPulls('a/b c?x=1');

    expect(seen[0]?.url).toBe(`${BASE}/repos/a%2Fb%20c%3Fx%3D1/pulls`);
  });
});

describe('startReview', () => {
  it('posts { "agentId": … } as JSON and returns the first run id', async () => {
    const body = {
      ...startedBody,
      runs: [
        { run_id: 'run-first', agent_id: 'agent-1', agent_name: 'A' },
        { run_id: 'run-second', agent_id: 'agent-2', agent_name: 'B' },
      ],
    };
    const { api, seen } = clientWith(() => json(body));

    const started = await api.startReview('pr-1', 'agent-1');

    expect(started).toEqual({ run_id: 'run-first' });
    expect(seen[0]?.method).toBe('POST');
    expect(seen[0]?.headers['content-type']).toBe('application/json');
    expect(JSON.parse(seen[0]?.body ?? 'null')).toEqual({ agentId: 'agent-1' });
  });

  it('answers an empty runs list with invalid_response naming the route', async () => {
    const { api } = clientWith(() => json({ ...startedBody, runs: [] }));

    const err = await failure(api.startReview('pr-1', 'agent-1'));

    expect(err.kind).toBe('invalid_response');
    expect(err.route).toBe('POST /pulls/:id/review');
  });
});

describe('failures at the HTTP boundary', () => {
  it('a 404 with an ApiErrorBody is kind http with status, code and the body message', async () => {
    const { api } = clientWith(() => json({ error: { code: 'not_found', message: 'Repo not found' } }, 404));

    const err = await failure(api.listPulls('nope'));

    expect(err.kind).toBe('http');
    expect(err.status).toBe(404);
    expect(err.code).toBe('not_found');
    expect(err.message).toBe('Repo not found');
    expect(err.route).toBe('GET /repos/:id/pulls');
  });

  it('a 500 with a non-JSON body is kind http with the status and no code', async () => {
    const { api } = clientWith(() => new Response('<html>Bad gateway</html>', { status: 500 }));

    const err = await failure(api.listAgents());

    expect(err.kind).toBe('http');
    expect(err.status).toBe(500);
    expect(err.code).toBeUndefined();
    expect(err.route).toBe('GET /agents');
  });

  it.each([
    ['the API error envelope', { error: { code: 'internal_error', message: 'Rate limit exceeded, retry in 1 minute' } }],
    [
      'the rate-limit plugin body',
      { statusCode: 429, error: 'Too Many Requests', message: 'Rate limit exceeded, retry in 1 minute' },
    ],
  ])('a 429 with %s is kind http with status 429', async (_label, body) => {
    const { api } = clientWith(() => json(body, 429));

    const err = await failure(api.listReviews('pr-1'));

    expect(err.kind).toBe('http');
    expect(err.status).toBe(429);
    expect(err.route).toBe('GET /pulls/:id/reviews');
  });

  it('a rejected fetch is kind unreachable and carries the route', async () => {
    const { api } = clientWith(() => {
      throw new TypeError('fetch failed');
    });

    const err = await failure(api.listRepos());

    expect(err.kind).toBe('unreachable');
    expect(err.route).toBe('GET /repos');
    expect(err.status).toBeUndefined();
  });

  it('a body that fails the view schema is kind invalid_response with the route', async () => {
    const { api } = clientWith(() => json([{ id: 'agent-1' }]));

    const err = await failure(api.listAgents());

    expect(err.kind).toBe('invalid_response');
    expect(err.route).toBe('GET /agents');
  });

  it('a 2xx body that is not JSON is kind invalid_response', async () => {
    const { api } = clientWith(() => new Response('ok', { status: 200 }));

    const err = await failure(api.getConventions('repo-1'));

    expect(err.kind).toBe('invalid_response');
    expect(err.route).toBe('GET /repos/:id/conventions');
  });

  it('a request slower than requestTimeoutMs is kind timeout', async () => {
    const { api } = clientWith(hang, { requestTimeoutMs: 20 });

    const err = await failure(api.listAgents());

    expect(err.kind).toBe('timeout');
    expect(err.route).toBe('GET /agents');
  });
});

describe('waitForRun', () => {
  it('delivers three frames split across chunk boundaries to onEvent in order, then resolves ended', async () => {
    const text = runEvent(1, 'reading the diff') + runEvent(2, 'héllo wörld') + runEvent(3, 'done');
    const { api, seen } = clientWith(() => sse(chunkedBody(text, 7)));
    const messages: string[] = [];

    const result = await api.waitForRun('run-9', { timeoutMs: 5000, onEvent: (m) => messages.push(m) });

    expect(result).toBe('ended');
    expect(messages).toEqual(['reading the diff', 'héllo wörld', 'done']);
    expect(seen[0]?.method).toBe('GET');
    expect(seen[0]?.url).toBe(`${BASE}/runs/run-9/events`);
    expect(seen[0]?.headers.accept).toBe('text/event-stream');
  });

  it('percent-encodes the run id in the path', async () => {
    const { api, seen } = clientWith(() => sse(chunkedBody('', 1)));

    await api.waitForRun('a/b', { timeoutMs: 5000 });

    expect(seen[0]?.url).toBe(`${BASE}/runs/a%2Fb/events`);
  });

  it('resolves timeout after timeoutMs when the stream stays open', async () => {
    const { api } = clientWith(() => sse(openBody([runEvent(1, 'first')])));
    const messages: string[] = [];

    const result = await api.waitForRun('run-9', { timeoutMs: 40, onEvent: (m) => messages.push(m) });

    expect(result).toBe('timeout');
    expect(messages).toEqual(['first']);
  });

  it('resolves timeout when the API never answers at all', async () => {
    const { api } = clientWith(hang);

    expect(await api.waitForRun('run-9', { timeoutMs: 30 })).toBe('timeout');
  });

  it('resolves ended, without throwing, when fetch rejects', async () => {
    const { api } = clientWith(() => {
      throw new TypeError('fetch failed');
    });
    const onEvent = vi.fn();

    await expect(api.waitForRun('run-9', { timeoutMs: 5000, onEvent })).resolves.toBe('ended');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('resolves ended, without throwing, when the API answers 500', async () => {
    const { api } = clientWith(() => new Response('boom', { status: 500 }));
    const onEvent = vi.fn();

    await expect(api.waitForRun('run-9', { timeoutMs: 5000, onEvent })).resolves.toBe('ended');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('resolves ended, without throwing, when the stream fails midway', async () => {
    const failing = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(runEvent(1, 'before the failure')));
      },
      pull(controller) {
        controller.error(new Error('connection reset'));
      },
    });
    const { api } = clientWith(() => sse(failing));

    await expect(api.waitForRun('run-9', { timeoutMs: 5000 })).resolves.toBe('ended');
  });

  it('ends the wait when the signal aborts, and delivers nothing after that', async () => {
    const { api } = clientWith(() => sse(openBody([runEvent(1, 'first')])));
    const controller = new AbortController();
    const messages: string[] = [];

    const result = await api.waitForRun('run-9', {
      timeoutMs: 5000,
      signal: controller.signal,
      onEvent: (m) => {
        messages.push(m);
        controller.abort();
      },
    });

    expect(result).toBe('ended');
    expect(messages).toEqual(['first']);
  });

  it('resolves ended at once when the signal is already aborted', async () => {
    // Like the real fetch, the stub refuses to start a request whose signal has already aborted.
    const { api } = clientWith((_seen, init) => {
      if (init.signal?.aborted) return Promise.reject(init.signal.reason);
      return sse(openBody([runEvent(1, 'never read')]));
    });
    const onEvent = vi.fn();

    const result = await api.waitForRun('run-9', { timeoutMs: 5000, signal: AbortSignal.abort(), onEvent });

    expect(result).toBe('ended');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('skips a frame whose data is not JSON, or has no msg, and keeps reading', async () => {
    const text =
      runEvent(1, 'one') +
      'id: 2\nevent: run\ndata: this is not json\n\n' +
      'id: 3\nevent: run\ndata: {"seq":3}\n\n' +
      ': a comment frame\n\n' +
      runEvent(4, 'four');
    const { api } = clientWith(() => sse(chunkedBody(text, 11)));
    const messages: string[] = [];

    const result = await api.waitForRun('run-9', { timeoutMs: 5000, onEvent: (m) => messages.push(m) });

    expect(result).toBe('ended');
    expect(messages).toEqual(['one', 'four']);
  });
});

describe('permissions (L3): the process can send only the eight requests of API_ROUTES', () => {
  it('API_ROUTES has exactly eight entries, one per method of the port', () => {
    const port: Array<keyof DevDigestApi> = [
      'getConventions',
      'listAgents',
      'listPulls',
      'listRepos',
      'listReviews',
      'listRuns',
      'startReview',
      'waitForRun',
    ];

    expect(Object.keys(API_ROUTES).sort()).toEqual(port);
  });

  it('exactly one route is a write, and it is POST /pulls/:id/review', () => {
    const routes = Object.values(API_ROUTES) as string[];

    expect(routes.filter((r) => r.startsWith('POST'))).toEqual(['POST /pulls/:id/review']);
    expect(routes.filter((r) => /^(DELETE|PUT|PATCH)\b/.test(r))).toEqual([]);
    expect(routes.filter((r) => r.startsWith('GET'))).toHaveLength(7);
  });

  it('after calling all eight methods, fetch saw only those eight method-and-path pairs', async () => {
    const { api, seen } = clientWith((s) => {
      if (s.url.endsWith('/events')) return sse(chunkedBody('', 1));
      if (s.method === 'POST') return json(startedBody);
      if (s.url.endsWith('/conventions')) return json(conventionsBody);
      return json([]);
    });

    await api.listAgents();
    await api.listRepos();
    await api.listPulls('ID');
    await api.listRuns('ID');
    await api.listReviews('ID');
    await api.getConventions('ID');
    await api.startReview('ID', 'AGENT');
    await api.waitForRun('ID', { timeoutMs: 5000 });

    const expected = (Object.values(API_ROUTES) as string[]).map((route) => {
      const [method, template] = route.split(' ');
      return `${method} ${BASE}${template?.replace(':id', 'ID')}`;
    });
    expect(seen.map((s) => `${s.method} ${s.url}`).sort()).toEqual(expected.sort());
  });

  it("the methods on HttpDevDigestApi's prototype are exactly the eight port names", () => {
    const methods = Object.getOwnPropertyNames(HttpDevDigestApi.prototype).filter((n) => n !== 'constructor');

    expect(methods.sort()).toEqual(Object.keys(API_ROUTES).sort());
  });

  it('an instance exposes no generic request: no own function, no request- or fetch-like member', () => {
    const api = new HttpDevDigestApi({ baseUrl: BASE, fetch: stubFetch(() => json([])).fetch });

    const members = new Set([...Object.getOwnPropertyNames(api), ...Object.getOwnPropertyNames(HttpDevDigestApi.prototype)]);

    for (const name of Object.getOwnPropertyNames(api)) {
      expect(typeof (api as unknown as Record<string, unknown>)[name]).not.toBe('function');
    }
    expect([...members].filter((n) => /request|fetch|send|call|get$|post$|put$|delete$/i.test(n))).toEqual([]);
  });
});
