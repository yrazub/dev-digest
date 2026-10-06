/**
 * OpenRouterProvider.completeStructured — the attempt loop. Hermetic: the SDK client's
 * `create` is replaced, so no key and no network are involved.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';
import { OutputTruncatedError } from '../src/llm/structured.js';

const Answer = z.object({ summary: z.string() });

interface Reply {
  content: string;
  finish_reason: 'stop' | 'length';
  completion_tokens?: number;
}

function providerReturning(replies: Reply[]) {
  const provider = new OpenRouterProvider('test-key');
  const create = vi.fn(async (_body: { messages: unknown[]; reasoning?: unknown }, _options?: { signal?: AbortSignal }) => {
    const reply = replies[Math.min(create.mock.calls.length - 1, replies.length - 1)]!;
    return {
      choices: [{ message: { content: reply.content }, finish_reason: reply.finish_reason }],
      usage: { prompt_tokens: 100, completion_tokens: reply.completion_tokens ?? 50, cost: 0.001 },
    };
  });
  (provider as unknown as { client: { chat: { completions: { create: typeof create } } } }).client = {
    chat: { completions: { create } },
  };
  return { provider, create };
}

const request = (maxTokens?: number) => ({
  model: 'some/model',
  schema: Answer,
  schemaName: 'Answer',
  messages: [{ role: 'user' as const, content: 'go' }],
  maxRetries: 2,
  ...(maxTokens ? { maxTokens } : {}),
});

describe('OpenRouterProvider.completeStructured', () => {
  it('returns a valid answer after one call', async () => {
    const { provider, create } = providerReturning([{ content: '{"summary":"ok"}', finish_reason: 'stop' }]);
    const res = await provider.completeStructured(request());
    expect(res.data).toEqual({ summary: 'ok' });
    expect(res.attempts).toBe(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not retry an answer that was cut off at the output limit', async () => {
    const { provider, create } = providerReturning([
      { content: '{"summary":"this stops mid-str', finish_reason: 'length', completion_tokens: 800 },
      { content: '{"summary":"ok"}', finish_reason: 'stop' },
    ]);
    const failure = await provider.completeStructured(request(800)).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(OutputTruncatedError);
    expect((failure as OutputTruncatedError).message).toBe(
      'Output for Answer was cut off at the output limit (max_tokens 800) before it was complete; not retried',
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('names no limit in the error when the request set none', async () => {
    const { provider } = providerReturning([{ content: '{"summary":', finish_reason: 'length' }]);
    const failure = await provider.completeStructured(request()).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(OutputTruncatedError);
    expect((failure as OutputTruncatedError).maxTokens).toBeNull();
    expect((failure as OutputTruncatedError).message).not.toContain('max_tokens');
  });

  it('keeps an answer that reached the limit but is complete and valid', async () => {
    const { provider, create } = providerReturning([{ content: '{"summary":"ok"}', finish_reason: 'length' }]);
    const res = await provider.completeStructured(request(800));
    expect(res.data).toEqual({ summary: 'ok' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('still repairs an answer that finished but does not match the schema', async () => {
    const { provider, create } = providerReturning([
      { content: '{"summary":42}', finish_reason: 'stop' },
      { content: '{"summary":"ok"}', finish_reason: 'stop' },
    ]);
    const res = await provider.completeStructured(request());
    expect(res.data).toEqual({ summary: 'ok' });
    expect(res.attempts).toBe(2);
    expect(res.tokensOut).toBe(100);
    expect(create).toHaveBeenCalledTimes(2);
    // The repair call carries the rejected answer and the reprompt.
    expect(create.mock.calls[1]![0].messages).toHaveLength(3);
  });

  it('sends the reasoning switch only when the request turns reasoning off', async () => {
    const off = providerReturning([{ content: '{"summary":"ok"}', finish_reason: 'stop' }]);
    await off.provider.completeStructured({ ...request(), reasoning: false });
    expect(off.create.mock.calls[0]![0].reasoning).toEqual({ enabled: false });

    for (const reasoning of [undefined, true]) {
      const kept = providerReturning([{ content: '{"summary":"ok"}', finish_reason: 'stop' }]);
      await kept.provider.completeStructured({ ...request(), ...(reasoning === undefined ? {} : { reasoning }) });
      expect('reasoning' in kept.create.mock.calls[0]![0]).toBe(false);
    }
  });

  it('does not send the reasoning switch to another OpenAI-compatible endpoint', async () => {
    const provider = new OpenRouterProvider('test-key', { id: 'openai', baseURL: 'https://example.test/v1' });
    const create = vi.fn(async (_body: Record<string, unknown>) => ({
      choices: [{ message: { content: '{"summary":"ok"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }));
    (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };
    await provider.completeStructured({ ...request(), reasoning: false });
    expect('reasoning' in create.mock.calls[0]![0]).toBe(false);
  });

  it('hands the abort signal to the HTTP call, and passes no options without one', async () => {
    const controller = new AbortController();
    const withSignal = providerReturning([{ content: '{"summary":"ok"}', finish_reason: 'stop' }]);
    await withSignal.provider.completeStructured({ ...request(), signal: controller.signal });
    expect(withSignal.create.mock.calls[0]![1]).toEqual({ signal: controller.signal });

    const without = providerReturning([{ content: '{"summary":"ok"}', finish_reason: 'stop' }]);
    await without.provider.completeStructured(request());
    expect(without.create.mock.calls[0]![1]).toBeUndefined();
  });

  it('starts no call once the signal is aborted, and no repair attempt after an abort', async () => {
    const aborted = new AbortController();
    aborted.abort();
    const never = providerReturning([{ content: '{"summary":"ok"}', finish_reason: 'stop' }]);
    await expect(never.provider.completeStructured({ ...request(), signal: aborted.signal })).rejects.toThrow();
    expect(never.create).not.toHaveBeenCalled();

    // The first answer needs a repair; the caller gives up while it is being produced.
    const controller = new AbortController();
    const { provider, create } = providerReturning([{ content: '{"summary":42}', finish_reason: 'stop' }]);
    create.mockImplementationOnce(async () => {
      controller.abort();
      return {
        choices: [{ message: { content: '{"summary":42}' }, finish_reason: 'stop' as const }],
        usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.001 },
      };
    });
    await expect(provider.completeStructured({ ...request(), signal: controller.signal })).rejects.toThrow();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('gives up with the schema error after the last repair attempt', async () => {
    const { provider, create } = providerReturning([{ content: '{"summary":42}', finish_reason: 'stop' }]);
    await expect(provider.completeStructured(request())).rejects.toThrow(/failed schema validation for Answer/);
    expect(create).toHaveBeenCalledTimes(3);
  });
});
