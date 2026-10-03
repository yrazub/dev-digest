import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';

type Params = { model: string; temperature?: number };

/** A fake `messages.create` that, like newer Claude models, rejects `temperature`. */
function fakeClient(rejectTemperature: boolean) {
  const calls: Params[] = [];
  const create = async (params: Params) => {
    calls.push(params);
    if (rejectTemperature && params.temperature !== undefined) {
      throw Object.assign(new Error('400 `temperature` is deprecated for this model.'), { status: 400 });
    }
    return {
      content: [{ type: 'tool_use', id: 't1', name: 'result', input: { ok: true } }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  };
  return { calls, client: { messages: { create } } };
}

function provider(client: unknown): AnthropicProvider {
  const p = new AnthropicProvider('test-key');
  (p as unknown as { client: unknown }).client = client;
  return p;
}

const request = (model: string) => ({
  model,
  schema: z.object({ ok: z.boolean() }),
  schemaName: 'result',
  messages: [{ role: 'user' as const, content: 'review' }],
});

describe('AnthropicProvider temperature and reprompt', () => {
  it('retries without temperature when the model rejects it, then stops sending it', async () => {
    const fake = fakeClient(true);
    const p = provider(fake.client);

    const first = await p.completeStructured(request('claude-new-model-a'));
    expect(first.data).toEqual({ ok: true });
    expect(fake.calls.map((c) => 'temperature' in c)).toEqual([true, false]);

    await p.completeStructured(request('claude-new-model-a'));
    expect(fake.calls.map((c) => 'temperature' in c)).toEqual([true, false, false]);
  });

  it('keeps sending temperature to models that accept it', async () => {
    const fake = fakeClient(false);
    await provider(fake.client).completeStructured(request('claude-old-model-b'));
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.temperature).toBe(0);
  });

  it('does not swallow other 400 errors', async () => {
    const client = {
      messages: {
        create: async () => {
          throw Object.assign(new Error('400 max_tokens is too large'), { status: 400 });
        },
      },
    };
    await expect(provider(client).completeStructured(request('claude-new-model-c'))).rejects.toThrow('max_tokens');
  });

  it('answers a schema-invalid tool call with a tool_result carrying the correction', async () => {
    const calls: { messages: { role: string; content: unknown }[] }[] = [];
    const replies = [{ ok: 'not-a-boolean' }, { ok: true }];
    const client = {
      messages: {
        create: async (params: { messages: { role: string; content: unknown }[] }) => {
          calls.push({ messages: [...params.messages] });
          return {
            content: [{ type: 'tool_use', id: `toolu_${calls.length}`, name: 'result', input: replies[calls.length - 1] }],
            usage: { input_tokens: 10, output_tokens: 5 },
          };
        },
      },
    };
    const res = await provider(client).completeStructured(request('claude-old-model-d'));
    expect(res.data).toEqual({ ok: true });
    expect(res.attempts).toBe(2);
    const last = calls[1]!.messages.at(-1)!;
    expect(last.role).toBe('user');
    expect(last.content).toEqual([
      expect.objectContaining({ type: 'tool_result', tool_use_id: 'toolu_1', is_error: true }),
    ]);
  });
});
