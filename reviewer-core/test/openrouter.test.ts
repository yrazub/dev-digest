import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';

type Body = { max_tokens?: number; provider?: { ignore?: string[] } };
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

  it('asks OpenRouter to skip the ignored upstream providers', async () => {
    const ok = () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"ok": true}' } }] });
    const skipping = provider({ reply: ok, ignore: ['open-inference'] });
    await skipping.p.completeStructured(request);
    expect(skipping.calls[0]!.body.provider).toEqual({ ignore: ['open-inference'] });

    const all = provider({ reply: ok });
    await all.p.completeStructured(request);
    expect(all.calls[0]!.body.provider).toBeUndefined();
  });
});
