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

function makeDeps(): ToolDeps & { log: ReturnType<typeof vi.fn> } {
  return { config: { apiUrl: 'http://127.0.0.1:1', waitMs: 1000 }, log: vi.fn() };
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
});
