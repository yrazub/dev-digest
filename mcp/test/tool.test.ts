import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  executeTool,
  sanitizeText,
  toolError,
  toolOk,
  ToolFailure,
  type ToolDef,
  type ToolDeps,
} from '../src/tool.js';
import { getBlastRadius } from '../src/tools/get-blast-radius.js';
import { MockDevDigestApi } from '../src/mocks.js';
import { ApiError } from '../src/ports.js';

function makeDeps(): ToolDeps & { log: ReturnType<typeof vi.fn> } {
  return { api: new MockDevDigestApi(), config: { apiUrl: 'http://127.0.0.1:1', waitMs: 1000 }, log: vi.fn() };
}

const inputShape = { name: z.string(), count: z.number().int() };

function makeTool(run: ToolDef<typeof inputShape>['run']): ToolDef<typeof inputShape> {
  return {
    name: 'throwaway',
    description: 'A tool that exists only in this test.',
    inputShape,
    annotations: { readOnlyHint: true },
    run,
  };
}

function textOf(result: { content: unknown }): string {
  const content = result.content as Array<{ type: string; text: string }>;
  expect(content).toHaveLength(1);
  expect(content[0]?.type).toBe('text');
  return content[0]?.text ?? '';
}

describe('toolOk', () => {
  it('returns one text block holding the compact JSON of the payload, and no structuredContent', () => {
    const result = toolOk({ a: 1, list: [{ b: 'x' }] });

    expect(result.content).toEqual([{ type: 'text', text: '{"a":1,"list":[{"b":"x"}]}' }]);
    expect(result).not.toHaveProperty('structuredContent');
    expect(result.isError).toBeUndefined();
  });
});

describe('executeTool', () => {
  it('passes valid arguments to run and wraps the payload with toolOk', async () => {
    const run = vi.fn(async () => ({ ok: true }));
    const deps = makeDeps();

    const result = await executeTool(makeTool(run as never), { name: 'a', count: 2 }, deps);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toEqual({ name: 'a', count: 2 });
    expect(result).toEqual(toolOk({ ok: true }));
  });

  const invalid: Array<[string, unknown, string]> = [
    ['a wrong type', { name: 5, count: 1 }, 'name:'],
    ['a missing field', { name: 'a' }, 'count:'],
    ['an unknown key', { name: 'a', count: 1, extra: true }, 'extra: unknown argument'],
  ];

  it.each(invalid)('answers %s with E-ARGS naming the field and the expected names, without calling run', async (_label, args, fragment) => {
    const run = vi.fn(async () => ({}));

    const result = await executeTool(makeTool(run as never), args, makeDeps());

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain('Invalid arguments for throwaway');
    expect(text).toContain(fragment);
    expect(text).toContain('Expected: name, count.');
    expect(run).not.toHaveBeenCalled();
  });

  it('treats undefined arguments as an empty object', async () => {
    const run = vi.fn(async () => ({}));

    const result = await executeTool(makeTool(run as never), undefined, makeDeps());

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Expected: name, count.');
    expect(run).not.toHaveBeenCalled();
  });

  it('shows the message of a thrown ToolFailure as written', async () => {
    const tool = makeTool(async () => {
      throw new ToolFailure('Repository "x/y" is not imported. Pass one of them.');
    });

    const result = await executeTool(tool, { name: 'a', count: 1 }, makeDeps());

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Repository "x/y" is not imported. Pass one of them.');
  });

  it('answers a thrown Error with E-INTERNAL, without its message, path or stack, and logs the detail', async () => {
    const tool = makeTool(async () => {
      throw new Error('boom at /Users/x');
    });
    const deps = makeDeps();

    const result = await executeTool(tool, { name: 'a', count: 1 }, deps);

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain('devdigest-mcp hit an unexpected error in throwaway');
    expect(text).toContain("stderr log");
    expect(text).not.toContain('boom');
    expect(text).not.toContain('/Users/x');
    expect(text).not.toMatch(/\bat .*\(|\.ts:\d+/);
    expect(deps.log).toHaveBeenCalledTimes(1);
    expect(String(deps.log.mock.calls[0]?.[0])).toContain('boom at /Users/x');
  });

  it('answers a thrown non-Error value with E-INTERNAL as well', async () => {
    const tool = makeTool(async () => {
      throw 'a plain string secret';
    });
    const deps = makeDeps();

    const result = await executeTool(tool, { name: 'a', count: 1 }, deps);

    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toContain('secret');
    expect(String(deps.log.mock.calls[0]?.[0])).toContain('a plain string secret');
  });
});

describe('toolError', () => {
  it('maps a stray ZodError to E-ARGS and does not log', () => {
    const deps = makeDeps();
    const parsed = z.object({ pr: z.number() }).safeParse({ pr: 'x' });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const result = toolError(parsed.error, deps, 'throwaway');

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid arguments for throwaway: pr:');
    expect(deps.log).not.toHaveBeenCalled();
  });
});

describe('toolError for an ApiError (E-API-*)', () => {
  const apiUrl = 'http://127.0.0.1:3001';
  const deps = (): ToolDeps & { log: ReturnType<typeof vi.fn> } => ({
    ...makeDeps(),
    config: { apiUrl, waitMs: 1000 },
  });

  it('unreachable names the configured URL and ./scripts/dev.sh (E-API-UNREACHABLE)', () => {
    const d = deps();

    const result = toolError(new ApiError('unreachable', 'GET /agents'), d, 'list_agents');

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain(`not reachable at ${apiUrl}`);
    expect(text).toContain('./scripts/dev.sh');
    expect(d.log).not.toHaveBeenCalled();
  });

  it('timeout names the route, 30 seconds and the /health URL (E-API-TIMEOUT)', () => {
    const text = textOf(toolError(new ApiError('timeout', 'GET /pulls/:id/reviews'), deps(), 'get_findings'));

    expect(text).toContain('GET /pulls/:id/reviews');
    expect(text).toContain('within 30 seconds');
    expect(text).toContain(`${apiUrl}/health`);
  });

  it('a 429 maps to E-API-RATE: rate limit, the route and "Wait 60 seconds"', () => {
    const err = new ApiError('http', 'GET /pulls/:id/runs', 429, 'internal_error', 'Rate limit exceeded, retry in 1 minute');

    const result = toolError(err, deps(), 'get_findings');

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain('rate limit');
    expect(text).toContain('GET /pulls/:id/runs');
    expect(text).toContain('Wait 60 seconds');
    expect(text).not.toContain('answered');
  });

  it('another http status maps to E-API-HTTP: status, code, route, message and the migrate hint', () => {
    const err = new ApiError('http', 'GET /repos/:id/pulls', 500, 'internal_error', 'relation "pull_requests" does not exist');

    const text = textOf(toolError(err, deps(), 'get_findings'));

    expect(text).toContain('answered 500 internal_error for GET /repos/:id/pulls');
    expect(text).toContain('relation "pull_requests" does not exist');
    expect(text).toContain('cd server && pnpm db:migrate');
  });

  it('an http error without a code still names the status and the route', () => {
    const err = new ApiError('http', 'GET /agents', 502);

    const text = textOf(toolError(err, deps(), 'list_agents'));

    expect(text).toContain('answered 502');
    expect(text).toContain('GET /agents');
  });

  it('invalid_response maps to E-API-SHAPE: unexpected response, the route and a restart step', () => {
    const text = textOf(toolError(new ApiError('invalid_response', 'POST /pulls/:id/review'), deps(), 'run_agent_on_pr'));

    expect(text).toContain('unexpected response');
    expect(text).toContain('POST /pulls/:id/review');
    expect(text).toContain('restart the API with ./scripts/dev.sh');
  });

  it('masks a token-like string in the API message', () => {
    const token = 'ghp_abcdefghijklmnop1234';
    const err = new ApiError('http', 'GET /agents', 500, 'internal_error', `upstream said ${token} is bad`);

    const text = textOf(toolError(err, deps(), 'list_agents'));

    expect(text).not.toContain(token);
    expect(text).toContain('upstream said *** is bad');
  });

  it('cuts an API message at 300 characters and collapses its whitespace', () => {
    const err = new ApiError('http', 'GET /agents', 500, 'internal_error', `first\n\n   second ${'x'.repeat(1000)}`);

    const text = textOf(toolError(err, deps(), 'list_agents'));

    expect(text).toContain('first second ');
    expect(text).toContain('…');
    expect(text).not.toContain('x'.repeat(300));
    expect(text.length).toBeLessThan(700);
  });

  it('every kind names a next step', () => {
    const next: Array<[ApiError, RegExp]> = [
      [new ApiError('unreachable', 'GET /agents'), /Start it/],
      [new ApiError('timeout', 'GET /agents'), /Check .*\/health, then retry/],
      [new ApiError('http', 'GET /agents', 429), /Wait 60 seconds, then retry/],
      [new ApiError('http', 'GET /agents', 500, 'x', 'm'), /pnpm db:migrate/],
      [new ApiError('invalid_response', 'GET /agents'), /restart the API/],
    ];

    for (const [err, step] of next) expect(textOf(toolError(err, deps(), 'list_agents'))).toMatch(step);
  });

  it('an ApiError thrown through a port reaches the caller as its catalogue text, not E-INTERNAL', async () => {
    const d = deps();
    d.api = new MockDevDigestApi({}, { fail: { listAgents: new ApiError('unreachable', 'GET /agents') } });
    const tool = makeTool(async (_args, toolDeps) => ({ agents: await toolDeps.api.listAgents() }));

    const result = await executeTool(tool, { name: 'a', count: 1 }, d);

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain(`not reachable at ${apiUrl}`);
    expect(text).not.toContain('unexpected error');
    expect(d.log).not.toHaveBeenCalled();
  });

  it('a ToolFailure still wins over the API mapping and an unknown Error is still E-INTERNAL', () => {
    expect(textOf(toolError(new ToolFailure('as written'), deps(), 't'))).toBe('as written');
    expect(textOf(toolError(new Error('boom'), deps(), 't'))).toContain('unexpected error in t');
  });
});

describe('sanitizeText', () => {
  it('collapses whitespace to single spaces and trims', () => {
    expect(sanitizeText('  a \n\t b   c  ', 100)).toBe('a b c');
  });

  it.each([
    ['sk-', 'sk-abcdefghijklmnop1234'],
    ['ghp_', 'ghp_abcdefghijklmnop1234'],
    ['github_pat_', 'github_pat_abcdefghijklmnop1234'],
  ])('masks a %s token', (_prefix, token) => {
    const out = sanitizeText(`failed with ${token} in header`, 200);

    expect(out).toBe('failed with *** in header');
    expect(out).not.toContain(token);
  });

  it('leaves a short prefix-like word alone', () => {
    expect(sanitizeText('use sk-short here', 100)).toBe('use sk-short here');
  });

  it('cuts at max with an ellipsis so the result is exactly max long', () => {
    const out = sanitizeText('abcdefghij', 5);

    expect(out).toBe('abcd…');
    expect(out).toHaveLength(5);
  });

  it('does not cut a text that fits', () => {
    expect(sanitizeText('abcde', 5)).toBe('abcde');
  });
});

describe('the get_blast_radius stub', () => {
  it('declares repo and pr and is read-only', () => {
    expect(getBlastRadius.name).toBe('get_blast_radius');
    expect(Object.keys(getBlastRadius.inputShape)).toEqual(['repo', 'pr']);
    expect(getBlastRadius.annotations.readOnlyHint).toBe(true);
  });

  it.each([
    [{ repo: 'acme/payments-api', pr: 7 }],
    [{ repo: 'other/thing', pr: 12345 }],
  ])('answers %j with E-BLAST: an error, never data, and nothing logged', async (args) => {
    const deps = makeDeps();

    const result = await executeTool(getBlastRadius as unknown as ToolDef, args, deps);

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain('not implemented');
    expect(text).toContain('Do not estimate or invent it');
    expect(text).toContain('get_findings');
    // No path, no symbol name, no figure; and nothing echoed from the arguments.
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/\.(ts|js|mjs)\b|\/src\//);
    expect(text).not.toContain(args.repo);
    expect(deps.log).not.toHaveBeenCalled();
  });

  it('gives the same text whatever the arguments are', async () => {
    const a = await executeTool(getBlastRadius as unknown as ToolDef, { repo: 'a/b', pr: 1 }, makeDeps());
    const b = await executeTool(getBlastRadius as unknown as ToolDef, { repo: 'c/d', pr: 99 }, makeDeps());

    expect(textOf(a)).toBe(textOf(b));
  });

  it('rejects arguments of the wrong shape before it runs', async () => {
    const result = await executeTool(getBlastRadius as unknown as ToolDef, { repo: 'a/b', pr: 0 }, makeDeps());

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid arguments for get_blast_radius');
    expect(textOf(result)).toContain('Expected: repo, pr.');
  });

  it('accepts a numeric string for pr, like get_findings and run_agent_on_pr: it reaches run and yields E-BLAST', async () => {
    const deps = makeDeps();
    const viaString = await executeTool(getBlastRadius as unknown as ToolDef, { repo: 'acme/payments-api', pr: '482' }, deps);
    const viaNumber = await executeTool(getBlastRadius as unknown as ToolDef, { repo: 'acme/payments-api', pr: 482 }, makeDeps());

    expect(viaString.isError).toBe(true);
    expect(textOf(viaString)).toContain('not implemented');
    expect(textOf(viaString)).not.toContain('Invalid arguments');
    expect(textOf(viaString)).toBe(textOf(viaNumber));
    expect(deps.log).not.toHaveBeenCalled();
  });

  it.each([
    ['"0"', '0'],
    ['"abc"', 'abc'],
    ['0', 0],
  ])('rejects pr %s before run', async (_label, pr) => {
    const result = await executeTool(getBlastRadius as unknown as ToolDef, { repo: 'a/b', pr }, makeDeps());

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('Invalid arguments for get_blast_radius');
    expect(textOf(result)).not.toContain('not implemented');
  });
});
