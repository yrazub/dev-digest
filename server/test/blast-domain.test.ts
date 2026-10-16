/**
 * L04 — blast domain (`modules/blast/domain.ts`): `toBlastRadius` regroups the repo-intel facade's flat
 * answer into the `BlastRadiusResponse`, `buildSummary` writes its sentence and `resolveDegraded` picks
 * the degraded mark. Hermetic: pure functions, no app, container or double.
 * Spec: `server/specs/L04-blast-radius.md` ("Building the response"); degraded order: `specs/L04-blast-radius.md`
 * ("Degraded is a mark, not an error", Q5); plan: `specs/plans/L04-blast-radius.md` (phase 3).
 */
import { describe, it, expect } from 'vitest';
import {
  BlastDegradedReason,
  BlastRadius,
  BlastRadiusResponse,
  BlastTotals as BlastTotalsSchema,
  type BlastTotals,
} from '@devdigest/shared';
import {
  buildSummary,
  resolveDegraded,
  toBlastRadius,
  type BlastContext,
  type BlastSourceCaller,
  type BlastSourceIndexState,
  type BlastSourceResult,
} from '../src/modules/blast/domain.js';

const FULL: BlastSourceIndexState = { status: 'full', lastIndexedSha: 'abc123' };

const ctx = (over: Partial<BlastContext> = {}): BlastContext => ({
  indexState: FULL,
  repoIntelEnabled: true,
  callerLimit: 20,
  prFilesMissing: false,
  ...over,
});

const sym = (name: string, file: string, kind = 'function') => ({ name, file, kind });
const caller = (viaSymbol: string, file: string, line: number, rank: number, symbol = 'enclosing'): BlastSourceCaller => ({
  file,
  symbol,
  viaSymbol,
  line,
  rank,
});
const result = (over: Partial<BlastSourceResult> = {}): BlastSourceResult => ({
  changedSymbols: [],
  callers: [],
  ...over,
});
const totals = (
  symbols: number,
  callers: number,
  endpoints: number,
  crons: number,
  symbolsWithoutCallers = 0,
): BlastTotals => ({
  symbols,
  callers,
  endpoints,
  crons,
  symbols_without_callers: symbolsWithoutCallers,
});

const groupOf = (res: ReturnType<typeof toBlastRadius>, symbol: string) => res.downstream.find((d) => d.symbol === symbol)!;

describe('toBlastRadius — grouping', () => {
  it('groups callers by the changed symbol they reach (B3)', () => {
    const res = toBlastRadius(
      result({
        changedSymbols: [sym('rateLimit', 'src/limit.ts'), sym('bucketKey', 'src/limit.ts')],
        callers: [
          caller('rateLimit', 'src/api/index.ts', 23, 5, 'publicRouter'),
          caller('bucketKey', 'src/jobs/reset.ts', 8, 4, 'resetBuckets'),
          caller('rateLimit', 'src/server.ts', 88, 3, 'app'),
        ],
      }),
      ctx(),
    );

    expect(res.downstream.map((d) => d.symbol).sort()).toEqual(['bucketKey', 'rateLimit']);
    expect(groupOf(res, 'rateLimit').callers).toEqual([
      { name: 'publicRouter', file: 'src/api/index.ts', line: 23 },
      { name: 'app', file: 'src/server.ts', line: 88 },
    ]);
    expect(groupOf(res, 'bucketKey').callers).toEqual([{ name: 'resetBuckets', file: 'src/jobs/reset.ts', line: 8 }]);
  });

  it('keeps changed_symbols as { name, file, kind } in the facade order', () => {
    const res = toBlastRadius(
      result({ changedSymbols: [sym('zeta', 'src/z.ts', 'class'), sym('alpha', 'src/a.ts', 'function')] }),
      ctx(),
    );
    expect(res.changed_symbols).toEqual([
      { name: 'zeta', file: 'src/z.ts', kind: 'class' },
      { name: 'alpha', file: 'src/a.ts', kind: 'function' },
    ]);
  });

  it('drops a caller whose file declares a changed symbol of that name (B5), and keeps one in a file that declares another', () => {
    const res = toBlastRadius(
      result({
        changedSymbols: [sym('rateLimit', 'src/limit.ts'), sym('bucketKey', 'src/key.ts')],
        callers: [
          caller('rateLimit', 'src/limit.ts', 41, 9, 'selfCall'), // declares rateLimit → dropped
          caller('rateLimit', 'src/key.ts', 7, 8, 'keyUser'), // declares bucketKey, not rateLimit → kept
        ],
      }),
      ctx(),
    );
    expect(groupOf(res, 'rateLimit').callers).toEqual([{ name: 'keyUser', file: 'src/key.ts', line: 7 }]);
    expect(res.totals.callers).toBe(1);
  });

  it('leaves no group when the only caller is in the declaring file', () => {
    const res = toBlastRadius(
      result({ changedSymbols: [sym('rateLimit', 'src/limit.ts')], callers: [caller('rateLimit', 'src/limit.ts', 41, 9)] }),
      ctx(),
    );
    expect(res.downstream).toEqual([]);
    expect(res.changed_symbols).toHaveLength(1);
  });

  it('drops a caller of a symbol that is not in changedSymbols', () => {
    const res = toBlastRadius(
      result({
        changedSymbols: [sym('rateLimit', 'src/limit.ts')],
        callers: [caller('ghost', 'src/api/index.ts', 1, 5), caller('rateLimit', 'src/api/index.ts', 2, 5)],
      }),
      ctx(),
    );
    expect(res.downstream.map((d) => d.symbol)).toEqual(['rateLimit']);
    expect(res.totals.callers).toBe(1);
  });

  it('drops a duplicate file + line inside one group, but not the same file + line in another group', () => {
    const res = toBlastRadius(
      result({
        changedSymbols: [sym('a', 'src/decl.ts'), sym('b', 'src/decl.ts')],
        callers: [
          caller('a', 'src/use.ts', 10, 5, 'first'),
          caller('a', 'src/use.ts', 10, 5, 'first'),
          caller('b', 'src/use.ts', 10, 5, 'first'),
        ],
      }),
      ctx(),
    );
    expect(groupOf(res, 'a').callers).toHaveLength(1);
    expect(groupOf(res, 'b').callers).toHaveLength(1);
    expect(res.totals.callers).toBe(2);
  });

  it('keeps a symbol without callers in changed_symbols only', () => {
    const res = toBlastRadius(
      result({
        changedSymbols: [sym('used', 'src/decl.ts'), sym('lonely', 'src/decl.ts')],
        callers: [caller('used', 'src/use.ts', 3, 1)],
      }),
      ctx(),
    );
    expect(res.changed_symbols.map((s) => s.name)).toEqual(['used', 'lonely']);
    expect(res.downstream.map((d) => d.symbol)).toEqual(['used']);
    expect(res.totals.symbols).toBe(2);
  });
});

describe('toBlastRadius — ordering (C5)', () => {
  it('orders callers by rank descending, then file, then line', () => {
    const res = toBlastRadius(
      result({
        changedSymbols: [sym('f', 'src/decl.ts')],
        callers: [
          caller('f', 'src/z.ts', 1, 5),
          caller('f', 'src/a.ts', 9, 5),
          caller('f', 'src/a.ts', 2, 5),
          caller('f', 'src/m.ts', 1, 9),
          caller('f', 'src/low.ts', 1, 1),
        ],
      }),
      ctx(),
    );
    expect(groupOf(res, 'f').callers.map((c) => `${c.file}:${c.line}`)).toEqual([
      'src/m.ts:1',
      'src/a.ts:2',
      'src/a.ts:9',
      'src/z.ts:1',
      'src/low.ts:1',
    ]);
  });

  it('breaks a file tie by code unit, not by locale', () => {
    const res = toBlastRadius(
      result({
        changedSymbols: [sym('f', 'src/decl.ts')],
        callers: [caller('f', 'src/a.ts', 1, 5), caller('f', 'src/B.ts', 1, 5)],
      }),
      ctx(),
    );
    // 'B' (0x42) sorts before 'a' (0x61) by code unit; localeCompare would put 'a' first.
    expect(groupOf(res, 'f').callers.map((c) => c.file)).toEqual(['src/B.ts', 'src/a.ts']);
  });

  it('orders groups by their highest caller rank descending, then by symbol', () => {
    const res = toBlastRadius(
      result({
        changedSymbols: [sym('zeta', 'src/d.ts'), sym('alpha', 'src/d.ts'), sym('beta', 'src/d.ts'), sym('mid', 'src/d.ts')],
        callers: [
          caller('zeta', 'src/u1.ts', 1, 10),
          caller('alpha', 'src/u2.ts', 1, 3),
          caller('beta', 'src/u3.ts', 1, 10),
          caller('mid', 'src/u4.ts', 1, 2),
          caller('mid', 'src/u5.ts', 1, 8), // mid's best caller outranks alpha's only one
        ],
      }),
      ctx(),
    );
    expect(res.downstream.map((d) => d.symbol)).toEqual(['beta', 'zeta', 'mid', 'alpha']);
  });
});

describe('toBlastRadius — endpoints and crons', () => {
  const facts = {
    'src/api/index.ts': { endpoints: ['GET /api/items', 'GET /api/health'], crons: [] },
    'src/api/webhooks.ts': { endpoints: ['POST /api/webhooks', 'GET /api/items'], crons: [] },
    'src/jobs/reset.ts': { endpoints: [], crons: ['reset-buckets (hourly)'] },
  };
  const source = (factsByFile: BlastSourceResult['factsByFile']) =>
    result({
      changedSymbols: [sym('rateLimit', 'src/limit.ts'), sym('bucketKey', 'src/limit.ts')],
      callers: [
        caller('rateLimit', 'src/api/index.ts', 23, 9),
        caller('rateLimit', 'src/api/webhooks.ts', 45, 8),
        caller('bucketKey', 'src/jobs/reset.ts', 8, 7),
        caller('bucketKey', 'src/api/index.ts', 30, 6),
      ],
      factsByFile,
    });

  it('takes the distinct, sorted union over the group\'s caller files', () => {
    const res = toBlastRadius(source(facts), ctx());
    expect(groupOf(res, 'rateLimit').endpoints_affected).toEqual(['GET /api/health', 'GET /api/items', 'POST /api/webhooks']);
    expect(groupOf(res, 'rateLimit').crons_affected).toEqual([]);
    expect(groupOf(res, 'bucketKey').endpoints_affected).toEqual(['GET /api/health', 'GET /api/items']);
    expect(groupOf(res, 'bucketKey').crons_affected).toEqual(['reset-buckets (hourly)']);
  });

  it('counts an endpoint shared by two groups once in the totals', () => {
    const res = toBlastRadius(source(facts), ctx());
    expect(res.totals).toEqual(totals(2, 4, 3, 1));
  });

  it('gives two empty lists when factsByFile is absent', () => {
    const res = toBlastRadius(source(undefined), ctx());
    for (const group of res.downstream) {
      expect(group.endpoints_affected).toEqual([]);
      expect(group.crons_affected).toEqual([]);
    }
    expect(res.totals.endpoints).toBe(0);
    expect(res.totals.crons).toBe(0);
  });

  it('gives empty lists for a caller file with no facts row', () => {
    const res = toBlastRadius(source({ 'src/jobs/reset.ts': facts['src/jobs/reset.ts'] }), ctx());
    expect(groupOf(res, 'rateLimit').endpoints_affected).toEqual([]);
    expect(groupOf(res, 'bucketKey').crons_affected).toEqual(['reset-buckets (hourly)']);
  });
});

describe('toBlastRadius — totals, summary, sha, limit', () => {
  const source = result({
    changedSymbols: [sym('a', 'src/d.ts'), sym('b', 'src/d.ts'), sym('c', 'src/d.ts')],
    callers: [
      caller('a', 'src/x.ts', 1, 3),
      caller('a', 'src/y.ts', 1, 2),
      caller('b', 'src/x.ts', 5, 1),
    ],
    factsByFile: {
      'src/x.ts': { endpoints: ['GET /x'], crons: ['nightly'] },
      'src/y.ts': { endpoints: ['GET /y'], crons: [] },
    },
  });

  it('counts symbols, callers, endpoints and crons from the arrays', () => {
    const res = toBlastRadius(source, ctx());
    // `c` has no caller, so it is the one symbol without callers
    expect(res.totals).toEqual(totals(3, 3, 2, 1, 1));
    expect(res.summary).toBe('3 changed symbols, 3 callers, 2 endpoints, 1 cron job.');
  });

  it('states indexed_sha as the index SHA, and null when it is empty', () => {
    expect(toBlastRadius(source, ctx()).indexed_sha).toBe('abc123');
    expect(toBlastRadius(source, ctx({ indexState: { status: 'degraded', lastIndexedSha: '', degradedReason: 'no_data' } })).indexed_sha).toBeNull();
  });

  it('copies caller_limit from the context', () => {
    expect(toBlastRadius(source, ctx({ callerLimit: 7 })).caller_limit).toBe(7);
  });

  it('answers a body that parses as BlastRadiusResponse and as BlastRadius (B2)', () => {
    const res = toBlastRadius(source, ctx());
    expect(BlastRadiusResponse.safeParse(res).success).toBe(true);
    expect(BlastRadius.safeParse(res).success).toBe(true);

    const empty = toBlastRadius(result(), ctx({ prFilesMissing: true }));
    expect(BlastRadiusResponse.safeParse(empty).success).toBe(true);
    expect(BlastRadius.safeParse(empty).success).toBe(true);
  });

  it('answers an empty map for an empty source', () => {
    const res = toBlastRadius(result(), ctx());
    expect(res.changed_symbols).toEqual([]);
    expect(res.downstream).toEqual([]);
    expect(res.totals).toEqual(totals(0, 0, 0, 0));
    expect(res.summary).toBe('No symbols are declared in the changed files.');
  });

  it('carries the resolved degraded mark into the body', () => {
    const res = toBlastRadius(source, ctx({ indexState: { status: 'partial', lastIndexedSha: 'abc123' } }));
    expect(res.degraded).toBe(true);
    expect(res.reason).toBe('index_partial');
    // the map is still there
    expect(res.downstream.length).toBeGreaterThan(0);
  });
});

describe('toBlastRadius — totals.symbols_without_callers', () => {
  it('counts the changed symbols whose name has no group in downstream', () => {
    const res = toBlastRadius(
      result({
        changedSymbols: [sym('used', 'src/decl.ts'), sym('lonely', 'src/decl.ts'), sym('alone', 'src/other.ts')],
        callers: [caller('used', 'src/use.ts', 3, 1)],
      }),
      ctx(),
    );
    expect(res.totals.symbols).toBe(3);
    expect(res.downstream.map((d) => d.symbol)).toEqual(['used']);
    expect(res.totals.symbols_without_callers).toBe(2);
  });

  it('counts a symbol whose only caller is dropped (B5) as one without callers', () => {
    const res = toBlastRadius(
      result({ changedSymbols: [sym('rateLimit', 'src/limit.ts')], callers: [caller('rateLimit', 'src/limit.ts', 41, 9)] }),
      ctx(),
    );
    expect(res.downstream).toEqual([]);
    expect(res.totals.symbols_without_callers).toBe(1);
  });

  it('is 0 when every changed symbol has callers', () => {
    const res = toBlastRadius(
      result({
        changedSymbols: [sym('a', 'src/d.ts'), sym('b', 'src/d.ts')],
        callers: [caller('a', 'src/x.ts', 1, 2), caller('b', 'src/y.ts', 1, 1)],
      }),
      ctx(),
    );
    expect(res.totals.symbols_without_callers).toBe(0);
  });

  it('counts names, not array lengths: two same-named symbols with callers share one group and leave 0 (D6)', () => {
    const res = toBlastRadius(
      result({
        changedSymbols: [sym('handler', 'src/a.ts'), sym('handler', 'src/b.ts')],
        callers: [caller('handler', 'src/use.ts', 3, 5), caller('handler', 'src/use2.ts', 9, 4)],
      }),
      ctx(),
    );
    expect(res.changed_symbols).toHaveLength(2);
    expect(res.downstream).toHaveLength(1);
    // a subtraction of the two lengths would say 1
    expect(res.totals.symbols_without_callers).toBe(0);
  });

  it('counts both of two same-named symbols when neither has callers', () => {
    const res = toBlastRadius(
      result({ changedSymbols: [sym('handler', 'src/a.ts'), sym('handler', 'src/b.ts')] }),
      ctx(),
    );
    expect(res.totals.symbols_without_callers).toBe(2);
  });

  it('parses in BlastTotals and in the whole response', () => {
    const res = toBlastRadius(
      result({ changedSymbols: [sym('a', 'src/d.ts'), sym('b', 'src/d.ts')], callers: [caller('a', 'src/x.ts', 1, 2)] }),
      ctx(),
    );
    expect(res.totals.symbols_without_callers).toBe(1);
    expect(BlastTotalsSchema.parse(res.totals)).toEqual(res.totals);
    expect(BlastRadiusResponse.safeParse(res).success).toBe(true);
  });
});

describe('buildSummary', () => {
  it('states all four numbers when at least one caller exists, zeros included', () => {
    expect(buildSummary(totals(2, 14, 3, 1))).toBe('2 changed symbols, 14 callers, 3 endpoints, 1 cron job.');
    expect(buildSummary(totals(2, 3, 0, 0))).toBe('2 changed symbols, 3 callers, 0 endpoints, 0 cron jobs.');
  });

  it('uses the singular for exactly one of each', () => {
    expect(buildSummary(totals(1, 1, 1, 1))).toBe('1 changed symbol, 1 caller, 1 endpoint, 1 cron job.');
  });

  it('says there are no downstream callers when symbols have none', () => {
    expect(buildSummary(totals(2, 0, 0, 0))).toBe('2 changed symbols, no downstream callers.');
    expect(buildSummary(totals(1, 0, 0, 0))).toBe('1 changed symbol, no downstream callers.');
  });

  it('says no symbols are declared when there are none', () => {
    expect(buildSummary(totals(0, 0, 0, 0))).toBe('No symbols are declared in the changed files.');
  });
});

describe('resolveDegraded — the six rows of the Q5 table', () => {
  const clean = { degraded: false } as const;

  it('row 1: PR files missing → pr_files_missing', () => {
    expect(resolveDegraded(clean, ctx({ prFilesMissing: true }))).toEqual({ degraded: true, reason: 'pr_files_missing' });
  });

  it('row 2: flag off → flag_off', () => {
    expect(resolveDegraded(clean, ctx({ repoIntelEnabled: false }))).toEqual({ degraded: true, reason: 'flag_off' });
  });

  it('row 3: a degraded or failed index → the state\'s own reason', () => {
    expect(
      resolveDegraded(clean, ctx({ indexState: { status: 'degraded', lastIndexedSha: 'x', degradedReason: 'no_data' } })),
    ).toEqual({ degraded: true, reason: 'no_data' });
    expect(
      resolveDegraded(clean, ctx({ indexState: { status: 'degraded', lastIndexedSha: 'x', degradedReason: 'repo_too_large' } })),
    ).toEqual({ degraded: true, reason: 'repo_too_large' });
    expect(
      resolveDegraded(clean, ctx({ indexState: { status: 'failed', lastIndexedSha: 'x', degradedReason: 'index_failed' } })),
    ).toEqual({ degraded: true, reason: 'index_failed' });
  });

  it('row 3: a degraded or failed index without a reason → index_failed', () => {
    expect(resolveDegraded(clean, ctx({ indexState: { status: 'degraded', lastIndexedSha: 'x' } }))).toEqual({
      degraded: true,
      reason: 'index_failed',
    });
    expect(resolveDegraded(clean, ctx({ indexState: { status: 'failed', lastIndexedSha: 'x' } }))).toEqual({
      degraded: true,
      reason: 'index_failed',
    });
  });

  it('row 4: the facade answered degraded → its reason, and no_data when it has none', () => {
    expect(resolveDegraded({ degraded: true, reason: 'no_data' }, ctx())).toEqual({ degraded: true, reason: 'no_data' });
    expect(resolveDegraded({ degraded: true, reason: 'repo_too_large' }, ctx())).toEqual({
      degraded: true,
      reason: 'repo_too_large',
    });
    expect(resolveDegraded({ degraded: true }, ctx())).toEqual({ degraded: true, reason: 'no_data' });
  });

  it('row 5: a partial index with a non-degraded facade → index_partial', () => {
    expect(resolveDegraded(clean, ctx({ indexState: { status: 'partial', lastIndexedSha: 'x' } }))).toEqual({
      degraded: true,
      reason: 'index_partial',
    });
  });

  it('row 6: a full index, a healthy facade → not degraded, reason null', () => {
    expect(resolveDegraded(clean, ctx())).toEqual({ degraded: false, reason: null });
    expect(resolveDegraded({}, ctx())).toEqual({ degraded: false, reason: null });
  });
});

describe('resolveDegraded — precedence (first match wins)', () => {
  const failed: BlastSourceIndexState = { status: 'failed', lastIndexedSha: 'x' };
  const noData = { degraded: true, reason: 'no_data' } as const;

  it('row 1 wins over a failed index and a degraded facade', () => {
    expect(resolveDegraded(noData, ctx({ prFilesMissing: true, indexState: failed, repoIntelEnabled: false }))).toEqual({
      degraded: true,
      reason: 'pr_files_missing',
    });
  });

  it('row 2 wins over a failed index', () => {
    expect(resolveDegraded(noData, ctx({ repoIntelEnabled: false, indexState: failed }))).toEqual({
      degraded: true,
      reason: 'flag_off',
    });
  });

  it('row 3 wins over row 4: a failed index with a no_data facade → index_failed (Q5)', () => {
    expect(resolveDegraded(noData, ctx({ indexState: failed }))).toEqual({ degraded: true, reason: 'index_failed' });
  });

  it('row 3 wins over row 4: a degraded index naming repo_too_large beats the facade\'s no_data', () => {
    expect(
      resolveDegraded(noData, ctx({ indexState: { status: 'degraded', lastIndexedSha: 'x', degradedReason: 'repo_too_large' } })),
    ).toEqual({ degraded: true, reason: 'repo_too_large' });
  });

  it('row 4 wins over row 5: a degraded facade on a partial index gives the facade\'s reason, not index_partial', () => {
    const partial: BlastSourceIndexState = { status: 'partial', lastIndexedSha: 'x' };
    expect(resolveDegraded({ degraded: true, reason: 'repo_too_large' }, ctx({ indexState: partial }))).toEqual({
      degraded: true,
      reason: 'repo_too_large',
    });
    expect(resolveDegraded({ degraded: true }, ctx({ indexState: partial }))).toEqual({ degraded: true, reason: 'no_data' });
  });

  it('a degraded facade on a full index gives the facade\'s reason', () => {
    expect(resolveDegraded({ degraded: true, reason: 'repo_too_large' }, ctx())).toEqual({
      degraded: true,
      reason: 'repo_too_large',
    });
  });
});

describe('resolveDegraded — reason is null exactly when degraded is false', () => {
  const statuses: BlastSourceIndexState['status'][] = ['full', 'partial', 'degraded', 'failed'];
  const reasons = [undefined, 'no_data', 'index_failed', 'index_partial', 'repo_too_large', 'flag_off'] as const;

  it('holds over every combination of inputs, and a reason is always one the contract knows', () => {
    let notDegraded = 0;
    for (const prFilesMissing of [false, true])
      for (const repoIntelEnabled of [true, false])
        for (const status of statuses)
          for (const degradedReason of reasons)
            for (const facadeDegraded of [false, true])
              for (const facadeReason of reasons) {
                const out = resolveDegraded(
                  { degraded: facadeDegraded, reason: facadeReason },
                  ctx({ prFilesMissing, repoIntelEnabled, indexState: { status, lastIndexedSha: 'x', degradedReason } }),
                );
                expect(out.reason === null).toBe(!out.degraded);
                if (out.reason !== null) expect(BlastDegradedReason.options).toContain(out.reason);
                if (!out.degraded) notDegraded++;
              }
    // at least the full-index, healthy-facade corner is not degraded
    expect(notDegraded).toBeGreaterThan(0);
  });
});
