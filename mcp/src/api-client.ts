import { z } from 'zod';
import { ApiErrorBody, ReviewRunResponse, RunEvent } from '@devdigest/shared';
import { REQUEST_TIMEOUT_MS } from './constants.js';
import {
  API_ROUTES,
  ApiAgent,
  ApiConventionList,
  ApiError,
  ApiPull,
  ApiRepo,
  ApiReview,
  ApiRun,
  type DevDigestApi,
} from './ports.js';

type RouteKey = keyof typeof API_ROUTES;

const StartedRuns = ReviewRunResponse.pick({ runs: true });
const EventMessage = RunEvent.pick({ msg: true });

interface Transport {
  baseUrl: string;
  fetchImpl: typeof fetch;
  requestTimeoutMs: number;
}

/** A timeout shows up as a `TimeoutError`; everything else that rejects means the API is not there. */
function failureKind(err: unknown): 'timeout' | 'unreachable' {
  return err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'unreachable';
}

/**
 * Fills the `:id` of a route template. `encodeURIComponent` leaves `.` and `..` alone, and a URL
 * parser would fold them into a path outside `API_ROUTES`; those and an empty id yield `undefined`.
 * A template without `:id` needs no id.
 */
function fillPath(template: string, id: string | undefined): string | undefined {
  if (!template.includes(':id')) return template;
  if (id === undefined || id === '' || id === '.' || id === '..') return undefined;
  return template.replace(':id', encodeURIComponent(id));
}

/**
 * The one place a JSON request is built (`waitForRun` makes its own SSE call). Both callers take
 * their method and path from `API_ROUTES`, never from a literal: what the process can ask the API
 * for is that table. This helper takes a key of `API_ROUTES`.
 * `id` is an id that came from an API response; it is percent-encoded into the path. An empty id, `.`
 * or `..` is an `invalid_response` for the route.
 */
async function request(
  transport: Transport,
  key: RouteKey,
  opts: { id?: string; body?: unknown } = {},
): Promise<unknown> {
  const route: string = API_ROUTES[key];
  const [method = 'GET', template = ''] = route.split(' ');
  const path = fillPath(template, opts.id);
  if (path === undefined) throw new ApiError('invalid_response', route);
  const hasBody = opts.body !== undefined;

  let response: Response;
  let text: string;
  try {
    response = await transport.fetchImpl(`${transport.baseUrl}${path}`, {
      method,
      headers: { accept: 'application/json', ...(hasBody ? { 'content-type': 'application/json' } : {}) },
      ...(hasBody ? { body: JSON.stringify(opts.body) } : {}),
      signal: AbortSignal.timeout(transport.requestTimeoutMs),
    });
    text = await response.text();
  } catch (err) {
    throw new ApiError(failureKind(err), route);
  }

  if (!response.ok) {
    let code: string | undefined;
    let message: string | undefined;
    try {
      const body = ApiErrorBody.safeParse(JSON.parse(text));
      if (body.success) {
        code = body.data.error.code;
        message = body.data.error.message;
      }
    } catch {
      // Not JSON: keep the status only.
    }
    throw new ApiError('http', route, response.status, code, message);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('invalid_response', route, response.status);
  }
}

/** Parses a response through its view; a mismatch is an `invalid_response` naming the route. */
function parseView<T>(key: RouteKey, schema: z.ZodType<T, z.ZodTypeDef, unknown>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError('invalid_response', API_ROUTES[key]);
  return parsed.data;
}

/** Pulls the `msg` out of one SSE frame (the `data:` lines of it); anything else is skipped. */
function frameMessage(frame: string): string | undefined {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''))
    .join('\n');
  if (!data) return undefined;
  try {
    const parsed = EventMessage.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data.msg : undefined;
  } catch {
    return undefined;
  }
}

/** Translates HTTP into the port. No retry, no choice between reviews, no error wording. */
export class HttpDevDigestApi implements DevDigestApi {
  private readonly transport: Transport;

  constructor(opts: { baseUrl: string; fetch?: typeof fetch; requestTimeoutMs?: number }) {
    this.transport = {
      baseUrl: opts.baseUrl,
      fetchImpl: opts.fetch ?? globalThis.fetch,
      requestTimeoutMs: opts.requestTimeoutMs ?? REQUEST_TIMEOUT_MS,
    };
  }

  async listAgents() {
    return parseView('listAgents', z.array(ApiAgent), await request(this.transport, 'listAgents'));
  }

  async listRepos() {
    return parseView('listRepos', z.array(ApiRepo), await request(this.transport, 'listRepos'));
  }

  async listPulls(repoId: string) {
    return parseView('listPulls', z.array(ApiPull), await request(this.transport, 'listPulls', { id: repoId }));
  }

  async listRuns(prId: string) {
    return parseView('listRuns', z.array(ApiRun), await request(this.transport, 'listRuns', { id: prId }));
  }

  async listReviews(prId: string) {
    return parseView(
      'listReviews',
      z.array(ApiReview),
      await request(this.transport, 'listReviews', { id: prId }),
    );
  }

  async getConventions(repoId: string) {
    return parseView(
      'getConventions',
      ApiConventionList,
      await request(this.transport, 'getConventions', { id: repoId }),
    );
  }

  async startReview(prId: string, agentId: string): Promise<{ run_id: string }> {
    const data = await request(this.transport, 'startReview', { id: prId, body: { agentId } });
    const started = parseView('startReview', StartedRuns, data);
    const first = started.runs[0];
    if (!first) throw new ApiError('invalid_response', API_ROUTES.startReview);
    return { run_id: first.run_id };
  }

  async waitForRun(
    runId: string,
    opts: { timeoutMs: number; signal?: AbortSignal; onEvent?: (message: string) => void },
  ): Promise<'ended' | 'timeout'> {
    const [, template = ''] = API_ROUTES.waitForRun.split(' ');
    const path = fillPath(template, runId);
    // The method never throws: an id that cannot be put in the path ends the wait.
    if (path === undefined) return 'ended';
    const url = `${this.transport.baseUrl}${path}`;

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, opts.timeoutMs);
    const onCallerAbort = (): void => controller.abort();
    if (opts.signal?.aborted) controller.abort();
    else opts.signal?.addEventListener('abort', onCallerAbort, { once: true });

    // A stream that ignores the abort must not hold the wait open.
    const aborted = new Promise<'aborted'>((resolve) => {
      if (controller.signal.aborted) resolve('aborted');
      else controller.signal.addEventListener('abort', () => resolve('aborted'), { once: true });
    });

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await Promise.race([
        this.transport.fetchImpl(url, {
          method: 'GET',
          headers: { accept: 'text/event-stream' },
          signal: controller.signal,
        }),
        aborted,
      ]);
      if (response === 'aborted' || !response.ok || !response.body) {
        return timedOut ? 'timeout' : 'ended';
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const chunk = await Promise.race([reader.read(), aborted]);
        if (chunk === 'aborted') break;
        if (chunk.done) return 'ended';
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const message = frameMessage(frame);
          if (message === undefined) continue;
          try {
            opts.onEvent?.(message);
          } catch {
            // A faulty listener must not end the wait.
          }
        }
      }
      return timedOut ? 'timeout' : 'ended';
    } catch {
      return timedOut ? 'timeout' : 'ended';
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onCallerAbort);
      reader?.cancel().catch(() => {});
    }
  }
}
