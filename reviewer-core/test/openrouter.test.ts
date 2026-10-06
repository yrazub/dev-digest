import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';
import { OutputTruncatedError } from '../src/llm/structured.js';

type Body = { max_tokens?: number; provider?: { sort?: string; ignore?: string[] }; reasoning?: unknown; messages?: unknown[] };
type Options = { signal?: AbortSignal };

/**
 * A fake `chat.completions.create`. `reply` decides what one call returns;
 * `hang` makes a call behave like a response body that never completes —
 * it settles only when its abort signal fires, as a real fetch would.
 */
function provider(opts: { hang?: boolean; reply?: () => unknown; timeoutMs?: number; ignore?: string[] } = {}) {
  const calls: { body: Body; options: Options }[] = [];
  const create = (body: Body, options: Options) => {
    calls.push({ body, options });
    if (opts.hang) {
      return new Promise((_, reject) => {
        options.signal?.addEventListener('abort', () => reject(new Error('Request was aborted.')));
      });
    }
    return Promise.resolve(opts.reply?.());
  };
  const p = new OpenRouterProvider('test-key', { timeoutMs: opts.timeoutMs ?? 90_000, ignoreProviders: opts.ignore });
  (p as unknown as { client: unknown }).client = { chat: { completions: { create } } };
  return { p, calls };
}

const request = {
  model: 'deepseek/deepseek-v4-flash',
  schema: z.object({ ok: z.boolean() }),
  schemaName: 'Review',
  messages: [{ role: 'user' as const, content: 'review' }],
};

describe('OpenRouterProvider deadlines and output cap', () => {
  it('sends max_tokens and ends a call whose body never completes at timeoutMs', async () => {
    const { p, calls } = provider({ hang: true });
    await expect(p.completeStructured({ ...request, maxTokens: 8000, timeoutMs: 50 })).rejects.toThrow(
      'did not finish within 0s',
    );
    expect(calls[0]!.body.max_tokens).toBe(8000);
    expect(calls[0]!.options.signal?.aborted).toBe(true);
  });

  it("rejects with the caller's reason when its signal aborts (cancel / run deadline)", async () => {
    const { p } = provider({ hang: true });
    const cancel = new AbortController();
    const pending = p.completeStructured({ ...request, timeoutMs: 60_000, signal: cancel.signal });
    cancel.abort(new Error('Run cancelled'));
    await expect(pending).rejects.toThrow('Run cancelled');
  });

  it('does not re-prompt a capped reply that is not valid JSON', async () => {
    const { p, calls } = provider({
      reply: () => ({
        provider: 'Open Inference',
        choices: [{ finish_reason: 'length', message: { content: '{"ok": tr' } }],
        usage: { prompt_tokens: 10, completion_tokens: 8000 },
      }),
    });
    await expect(p.completeStructured({ ...request, maxTokens: 8000 })).rejects.toThrow(
      'hit the 8000 token limit without valid JSON (provider: Open Inference)',
    );
    expect(calls).toHaveLength(1);
  });

  it('still returns a valid reply normally', async () => {
    const { p } = provider({
      reply: () => ({
        choices: [{ finish_reason: 'stop', message: { content: '{"ok": true}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      }),
    });
    const res = await p.completeStructured({ ...request, maxTokens: 8000 });
    expect(res.data).toEqual({ ok: true });
  });

  it('asks OpenRouter for the fastest provider, skipping the ignored ones', async () => {
    const ok = () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"ok": true}' } }] });
    const skipping = provider({ reply: ok, ignore: ['open-inference'] });
    await skipping.p.completeStructured(request);
    expect(skipping.calls[0]!.body.provider).toEqual({ sort: 'throughput', ignore: ['open-inference'] });

    const all = provider({ reply: ok });
    await all.p.completeStructured(request);
    expect(all.calls[0]!.body.provider).toEqual({ sort: 'throughput' });
  });
});

describe('OpenRouterProvider — the cut-off error, the repair loop and the reasoning switch', () => {
  const valid = () => ({
    choices: [{ finish_reason: 'stop', message: { content: '{"ok": true}' } }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  });

  it('throws a typed error for a capped reply that does not parse, so a caller need not read the message', async () => {
    const { p, calls } = provider({
      reply: () => ({
        choices: [{ finish_reason: 'length', message: { content: '{"ok": tr' } }],
        usage: { prompt_tokens: 10, completion_tokens: 800 },
      }),
    });
    const failure = await p.completeStructured({ ...request, maxTokens: 800 }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(OutputTruncatedError);
    expect(failure).toMatchObject({ schemaName: 'Review', maxTokens: 800 });
    expect(calls).toHaveLength(1);
  });

  it('keeps a reply that reached the limit but is complete and valid', async () => {
    const { p, calls } = provider({
      reply: () => ({
        choices: [{ finish_reason: 'length', message: { content: '{"ok": true}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 800 },
      }),
    });
    const res = await p.completeStructured({ ...request, maxTokens: 800 });
    expect(res.data).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
  });

  it('still repairs a reply that finished but does not match the schema, summing the tokens', async () => {
    let n = 0;
    const { p, calls } = provider({
      reply: () =>
        n++ === 0
          ? { choices: [{ finish_reason: 'stop', message: { content: '{"ok": 42}' } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }
          : valid(),
    });
    const res = await p.completeStructured({ ...request, maxRetries: 2 });
    expect(res.data).toEqual({ ok: true });
    expect(res.attempts).toBe(2);
    expect(res.tokensOut).toBe(100);
    expect(calls).toHaveLength(2);
  });

  it('gives up with the schema error after the last repair attempt', async () => {
    const { p, calls } = provider({
      reply: () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"ok": 42}' } }], usage: {} }),
    });
    await expect(p.completeStructured({ ...request, maxRetries: 2 })).rejects.toThrow(
      /failed schema validation for Review/,
    );
    expect(calls).toHaveLength(3);
  });

  it('sends the reasoning switch only when the request turns reasoning off', async () => {
    const off = provider({ reply: valid });
    await off.p.completeStructured({ ...request, reasoning: false });
    expect(off.calls[0]!.body.reasoning).toEqual({ enabled: false });

    for (const reasoning of [undefined, true]) {
      const kept = provider({ reply: valid });
      await kept.p.completeStructured({ ...request, ...(reasoning === undefined ? {} : { reasoning }) });
      expect('reasoning' in kept.calls[0]!.body).toBe(false);
    }
  });

  it('does not send the reasoning switch to another OpenAI-compatible endpoint', async () => {
    const other = new OpenRouterProvider('test-key', { id: 'openai', baseURL: 'https://example.test/v1' });
    const bodies: Body[] = [];
    (other as unknown as { client: unknown }).client = {
      chat: { completions: { create: (body: Body) => (bodies.push(body), Promise.resolve(valid())) } },
    };
    await other.completeStructured({ ...request, reasoning: false });
    expect('reasoning' in bodies[0]!).toBe(false);
  });

  it('starts no repair attempt once the caller has aborted', async () => {
    const cancel = new AbortController();
    const { p, calls } = provider({
      reply: () => {
        cancel.abort(new Error('Caller gave up'));
        return { choices: [{ finish_reason: 'stop', message: { content: '{"ok": 42}' } }], usage: {} };
      },
    });
    await expect(p.completeStructured({ ...request, maxRetries: 2, signal: cancel.signal })).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});
