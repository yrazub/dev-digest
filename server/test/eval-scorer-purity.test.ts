/**
 * The scorer is a pure function of expectations and findings (R-SRV-24): its module imports
 * nothing but `@devdigest/shared`, and scoring a fixture never touches a model.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { aggregateRun, scoreCase } from '../src/modules/eval/domain.js';

describe('eval scorer purity (R-SRV-24)', () => {
  it('imports nothing but @devdigest/shared', () => {
    const src = readFileSync(new URL('../src/modules/eval/domain.ts', import.meta.url), 'utf8');
    const specifiers = [
      ...src.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/gms),
      ...src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
      ...src.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
      ...src.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((m) => m[1]);

    expect(specifiers.length).toBeGreaterThan(0); // the scan found the import it should
    expect(specifiers.every((s) => s === '@devdigest/shared')).toBe(true);
  });

  it('scores a fixture with a mock model standing by and never calls it', () => {
    const llm = new MockLLMProvider();
    const e = {
      kind: 'must_find' as const,
      file: 'src/a.ts',
      start_line: 10,
      end_line: 20,
      title: 'Expected',
      severity: 'WARNING' as const,
      category: 'bug' as const,
    };
    const scored = scoreCase(
      e,
      [{ file: 'src/a.ts', start_line: 12, end_line: 14, title: 't', severity: 'WARNING', category: 'bug' }],
      1,
    );
    const run = aggregateRun([
      { kind: 'must_find', error: null, pass: scored.pass, actual_output: scored.actual_output, cost_usd: 0 },
    ]);

    expect(scored.pass).toBe(true);
    expect(run.recall).toBe(1);
    expect(llm.calls).toEqual([]);
  });
});
