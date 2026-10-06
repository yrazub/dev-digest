/**
 * applyScopeFilter / isSeriousOutOfScope — the deterministic half of the scope
 * filter. The model only tags `scope`; these rules decide from severity,
 * category and kind alone. Pure functions: values in, values out, no doubles.
 */
import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { applyScopeFilter, isSeriousOutOfScope } from '../src/scope.js';

let seq = 0;
function finding(over: Partial<Finding> = {}): Finding {
  seq += 1;
  return {
    id: `f${seq}`,
    severity: 'WARNING',
    category: 'bug',
    title: `finding ${seq}`,
    file: 'src/a.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'because',
    confidence: 0.8,
    kind: 'finding',
    scope: 'out_of_scope',
    ...over,
  };
}

const ids = (fs: Finding[]) => fs.map((f) => f.id);

describe('applyScopeFilter — kept untouched', () => {
  it('keeps in_scope and untagged findings, whatever their severity', () => {
    const inScope = finding({ id: 'in', scope: 'in_scope', severity: 'SUGGESTION' });
    const untagged = finding({ id: 'none', scope: undefined, severity: 'WARNING' });
    const nulled = finding({ id: 'null', scope: null, severity: 'SUGGESTION' });
    const r = applyScopeFilter([inScope, untagged, nulled]);
    expect(ids(r.kept)).toEqual(['in', 'none', 'null']);
    expect(r.filtered).toEqual([]);
    expect(r.signals).toEqual([]);
  });

  it('keeps each full-file scanner kind whatever its tag or severity', () => {
    const scanners = (['secret_leak', 'lethal_trifecta', 'phantom', 'hook'] as const).map((kind) =>
      finding({ id: kind, kind, severity: 'SUGGESTION', scope: 'out_of_scope' }),
    );
    const r = applyScopeFilter(scanners);
    expect(ids(r.kept)).toEqual(['secret_leak', 'lethal_trifecta', 'phantom', 'hook']);
    expect(r.filtered).toEqual([]);
    // a scanner finding is exempt, it is not counted as an out-of-scope signal
    expect(r.signals).toEqual([]);
  });

  it('keeps a scanner-kind CRITICAL out_of_scope finding unchanged (exempt, not a signal)', () => {
    const leak = finding({ id: 'leak', kind: 'secret_leak', severity: 'CRITICAL' });
    const r = applyScopeFilter([leak]);
    expect(r.kept).toEqual([leak]);
    expect(r.signals).toEqual([]);
  });
});

describe('applyScopeFilter — filtered with a reason', () => {
  it('filters an out-of-scope SUGGESTION, naming the severity in the reason', () => {
    const s = finding({ id: 's', severity: 'SUGGESTION' });
    const r = applyScopeFilter([s]);
    expect(r.kept).toEqual([]);
    expect(r.filtered).toEqual([{ finding: s, reason: 'out of scope (SUGGESTION)' }]);
    expect(r.signals).toEqual([]);
  });

  it('filters an out-of-scope non-security WARNING', () => {
    for (const category of ['bug', 'perf', 'style', 'test'] as const) {
      const w = finding({ id: category, severity: 'WARNING', category });
      const r = applyScopeFilter([w]);
      expect(r.kept).toEqual([]);
      expect(r.filtered).toEqual([{ finding: w, reason: 'out of scope (WARNING)' }]);
    }
  });

  it('filters a security SUGGESTION (only CRITICAL and security WARNING are serious)', () => {
    const s = finding({ severity: 'SUGGESTION', category: 'security' });
    expect(applyScopeFilter([s]).filtered).toHaveLength(1);
  });
});

describe('applyScopeFilter — serious out-of-scope findings are signals', () => {
  it('keeps an out-of-scope CRITICAL as-is: severity unchanged, scope still out_of_scope', () => {
    const c = finding({ id: 'c', severity: 'CRITICAL', category: 'bug' });
    const r = applyScopeFilter([c]);
    expect(r.kept).toEqual([c]);
    expect(r.signals).toEqual([c]);
    expect(r.kept[0]!.severity).toBe('CRITICAL');
    expect(r.kept[0]!.scope).toBe('out_of_scope');
    expect(r.filtered).toEqual([]);
  });

  it('keeps an out-of-scope security WARNING', () => {
    const w = finding({ id: 'sec', severity: 'WARNING', category: 'security' });
    const r = applyScopeFilter([w]);
    expect(r.kept).toEqual([w]);
    expect(r.signals).toEqual([w]);
  });

  it('does not mutate its input findings', () => {
    const c = finding({ severity: 'CRITICAL' });
    const copy = structuredClone(c);
    applyScopeFilter([c]);
    expect(c).toEqual(copy);
  });
});

describe('applyScopeFilter — one signal per distinct problem', () => {
  it('collapses two serious findings on overlapping lines of one file to one signal + one filtered duplicate', () => {
    const a = finding({ id: 'a', severity: 'CRITICAL', start_line: 10, end_line: 14 });
    const b = finding({ id: 'b', severity: 'CRITICAL', start_line: 12, end_line: 20 });
    const r = applyScopeFilter([a, b]);
    expect(ids(r.signals)).toHaveLength(1);
    expect(ids(r.kept)).toHaveLength(1);
    expect(r.filtered).toHaveLength(1);
    expect(r.filtered[0]!.reason).toBe('duplicate of out-of-scope signal');
    expect(new Set([...ids(r.kept), ...ids(r.filtered.map((d) => d.finding))])).toEqual(
      new Set(['a', 'b']),
    );
  });

  it('treats touching ranges as overlapping (shared boundary line)', () => {
    const a = finding({ id: 'a', severity: 'CRITICAL', start_line: 10, end_line: 12 });
    const b = finding({ id: 'b', severity: 'CRITICAL', start_line: 12, end_line: 15 });
    expect(applyScopeFilter([a, b]).signals).toHaveLength(1);
  });

  it('keeps both when the ranges are adjacent but do not share a line', () => {
    const a = finding({ id: 'a', severity: 'CRITICAL', start_line: 10, end_line: 11 });
    const b = finding({ id: 'b', severity: 'CRITICAL', start_line: 12, end_line: 15 });
    expect(ids(applyScopeFilter([a, b]).signals)).toEqual(['a', 'b']);
  });

  it('leaves two signals when the findings are in different files', () => {
    const a = finding({ id: 'a', file: 'src/a.ts', severity: 'CRITICAL', start_line: 10 });
    const b = finding({ id: 'b', file: 'src/b.ts', severity: 'CRITICAL', start_line: 10 });
    const r = applyScopeFilter([a, b]);
    expect(ids(r.signals)).toEqual(['a', 'b']);
    expect(ids(r.kept)).toEqual(['a', 'b']);
    expect(r.filtered).toEqual([]);
  });

  it('leaves two signals when the same file has disjoint ranges', () => {
    const a = finding({ id: 'a', severity: 'CRITICAL', start_line: 1, end_line: 3 });
    const b = finding({ id: 'b', severity: 'CRITICAL', start_line: 50, end_line: 60 });
    expect(applyScopeFilter([a, b]).signals).toHaveLength(2);
  });

  it('the most severe wins, even when it comes later in the input', () => {
    const warn = finding({ id: 'warn', severity: 'WARNING', category: 'security', confidence: 0.99 });
    const crit = finding({ id: 'crit', severity: 'CRITICAL', category: 'bug', confidence: 0.1 });
    const r = applyScopeFilter([warn, crit]);
    expect(ids(r.signals)).toEqual(['crit']);
    expect(r.filtered.map((d) => d.finding.id)).toEqual(['warn']);
  });

  it('on equal severity the most confident wins', () => {
    const low = finding({ id: 'low', severity: 'CRITICAL', confidence: 0.4 });
    const high = finding({ id: 'high', severity: 'CRITICAL', confidence: 0.9 });
    const r = applyScopeFilter([low, high]);
    expect(ids(r.signals)).toEqual(['high']);
    expect(r.filtered.map((d) => d.finding.id)).toEqual(['low']);
  });

  it('on equal severity and confidence the earliest wins', () => {
    const first = finding({ id: 'first', severity: 'CRITICAL', confidence: 0.7 });
    const second = finding({ id: 'second', severity: 'CRITICAL', confidence: 0.7 });
    const r = applyScopeFilter([first, second]);
    expect(ids(r.signals)).toEqual(['first']);
    expect(r.filtered.map((d) => d.finding.id)).toEqual(['second']);
  });

  it('clusters transitively: A~B and B~C is one signal even though A and C do not overlap', () => {
    const a = finding({ id: 'a', severity: 'CRITICAL', confidence: 0.5, start_line: 1, end_line: 5 });
    const b = finding({ id: 'b', severity: 'CRITICAL', confidence: 0.6, start_line: 5, end_line: 10 });
    const c = finding({ id: 'c', severity: 'CRITICAL', confidence: 0.9, start_line: 10, end_line: 15 });
    const r = applyScopeFilter([a, b, c]);
    expect(ids(r.signals)).toEqual(['c']);
    expect(ids(r.kept)).toEqual(['c']);
    expect(r.filtered.map((d) => d.finding.id).sort()).toEqual(['a', 'b']);
    expect(r.filtered.every((d) => d.reason === 'duplicate of out-of-scope signal')).toBe(true);
  });

  it('handles an inverted range (end_line before start_line) as the same span', () => {
    const a = finding({ id: 'a', severity: 'CRITICAL', start_line: 14, end_line: 10 });
    const b = finding({ id: 'b', severity: 'CRITICAL', start_line: 12, end_line: 12 });
    expect(applyScopeFilter([a, b]).signals).toHaveLength(1);
  });

  it('does not merge a serious finding into a non-serious one on the same lines', () => {
    const crit = finding({ id: 'crit', severity: 'CRITICAL' });
    const sugg = finding({ id: 'sugg', severity: 'SUGGESTION' });
    const r = applyScopeFilter([crit, sugg]);
    expect(ids(r.signals)).toEqual(['crit']);
    // the suggestion is filtered as plain out-of-scope, not as a duplicate
    expect(r.filtered).toEqual([{ finding: sugg, reason: 'out of scope (SUGGESTION)' }]);
  });
});

describe('applyScopeFilter — order and totals', () => {
  it('preserves input order in kept, including signals and untagged findings', () => {
    const list = [
      finding({ id: '1', scope: 'in_scope' }),
      finding({ id: '2', severity: 'SUGGESTION' }), // filtered
      finding({ id: '3', severity: 'CRITICAL', file: 'src/b.ts' }), // signal
      finding({ id: '4', scope: undefined }),
      finding({ id: '5', kind: 'hook', severity: 'SUGGESTION' }), // scanner
      finding({ id: '6', severity: 'WARNING', category: 'security', file: 'src/c.ts' }), // signal
    ];
    const r = applyScopeFilter(list);
    expect(ids(r.kept)).toEqual(['1', '3', '4', '5', '6']);
    expect(ids(r.signals)).toEqual(['3', '6']);
    expect(r.filtered.map((d) => d.finding.id)).toEqual(['2']);
  });

  it('every input finding lands in exactly one of kept or filtered', () => {
    const list = [
      finding({ severity: 'CRITICAL' }),
      finding({ severity: 'CRITICAL' }),
      finding({ severity: 'SUGGESTION' }),
      finding({ scope: 'in_scope' }),
    ];
    const r = applyScopeFilter(list);
    expect(r.kept.length + r.filtered.length).toBe(list.length);
  });

  it('returns empty results for no findings', () => {
    expect(applyScopeFilter([])).toEqual({ kept: [], filtered: [], signals: [] });
  });
});

describe('isSeriousOutOfScope', () => {
  it('is true for out-of-scope CRITICAL and security WARNING only', () => {
    expect(isSeriousOutOfScope(finding({ severity: 'CRITICAL', category: 'style' }))).toBe(true);
    expect(isSeriousOutOfScope(finding({ severity: 'WARNING', category: 'security' }))).toBe(true);
    expect(isSeriousOutOfScope(finding({ severity: 'WARNING', category: 'bug' }))).toBe(false);
    expect(isSeriousOutOfScope(finding({ severity: 'SUGGESTION', category: 'security' }))).toBe(false);
  });

  it('is false for in_scope, untagged and scanner-kind findings', () => {
    expect(isSeriousOutOfScope(finding({ severity: 'CRITICAL', scope: 'in_scope' }))).toBe(false);
    expect(isSeriousOutOfScope(finding({ severity: 'CRITICAL', scope: undefined }))).toBe(false);
    expect(isSeriousOutOfScope(finding({ severity: 'CRITICAL', kind: 'secret_leak' }))).toBe(false);
  });
});
