/**
 * Pure eval rules (`modules/eval/domain.ts`): the match rule, the per-case score, the run
 * aggregate, the diff fragment cut and the case naming (R-SRV-4, R-SRV-8, R-SRV-12,
 * R-SRV-19–R-SRV-23). No DB, no model.
 */
import { describe, it, expect } from 'vitest';
import type { EvalExpectation } from '@devdigest/shared';
import {
  CASE_SLUG_MAX,
  FRAGMENT_CUT_LINES,
  MUST_FIND_LINE_TOLERANCE,
  aggregateRun,
  caseName,
  cutFileSection,
  findingMatches,
  outcomeOf,
  rawDiffFromPatches,
  scoreCase,
} from '../src/modules/eval/domain.js';

const mustFind = (start = 10, end = 20, file = 'src/a.ts'): EvalExpectation => ({
  kind: 'must_find',
  file,
  start_line: start,
  end_line: end,
  title: 'Expected',
  severity: 'WARNING',
  category: 'bug',
});
const mustNotFlag = (start = 10, end = 20, file = 'src/a.ts'): EvalExpectation => ({
  ...mustFind(start, end, file),
  kind: 'must_not_flag',
});

const kept = (start: number, end: number, file = 'src/a.ts') => ({
  file,
  start_line: start,
  end_line: end,
  title: `finding ${start}-${end}`,
  severity: 'WARNING' as const,
  category: 'bug' as const,
});

describe('findingMatches (R-SRV-19)', () => {
  const e = mustFind(10, 20);

  it('matches when the ranges touch at either end (inclusive)', () => {
    expect(findingMatches({ file: 'src/a.ts', start_line: 5, end_line: 10 }, e)).toBe(true);
    expect(findingMatches({ file: 'src/a.ts', start_line: 20, end_line: 30 }, e)).toBe(true);
  });

  it('uses a tolerance of 2 lines for must_find', () => {
    expect(MUST_FIND_LINE_TOLERANCE).toBe(2);
  });

  it('must_find still matches 1 and 2 lines past either end (the tolerance)', () => {
    expect(findingMatches({ file: 'src/a.ts', start_line: 1, end_line: 9 }, e)).toBe(true);
    expect(findingMatches({ file: 'src/a.ts', start_line: 1, end_line: 8 }, e)).toBe(true);
    expect(findingMatches({ file: 'src/a.ts', start_line: 21, end_line: 30 }, e)).toBe(true);
    expect(findingMatches({ file: 'src/a.ts', start_line: 22, end_line: 30 }, e)).toBe(true);
  });

  it('must_find does not match 3 lines past either end', () => {
    expect(findingMatches({ file: 'src/a.ts', start_line: 1, end_line: 7 }, e)).toBe(false);
    expect(findingMatches({ file: 'src/a.ts', start_line: 23, end_line: 30 }, e)).toBe(false);
  });

  it('must_not_flag stays an exact overlap: one line past either end does not match', () => {
    const n = mustNotFlag(10, 20);
    expect(findingMatches({ file: 'src/a.ts', start_line: 1, end_line: 9 }, n)).toBe(false);
    expect(findingMatches({ file: 'src/a.ts', start_line: 21, end_line: 30 }, n)).toBe(false);
    expect(findingMatches({ file: 'src/a.ts', start_line: 5, end_line: 10 }, n)).toBe(true);
    expect(findingMatches({ file: 'src/a.ts', start_line: 20, end_line: 30 }, n)).toBe(true);
  });

  it('the tolerance never crosses files', () => {
    expect(findingMatches({ file: 'src/b.ts', start_line: 21, end_line: 22 }, e)).toBe(false);
  });

  it('matches a range fully inside and one fully containing the expectation', () => {
    expect(findingMatches({ file: 'src/a.ts', start_line: 12, end_line: 14 }, e)).toBe(true);
    expect(findingMatches({ file: 'src/a.ts', start_line: 1, end_line: 99 }, e)).toBe(true);
  });

  it('never matches another file, even on the same lines', () => {
    expect(findingMatches({ file: 'src/b.ts', start_line: 10, end_line: 20 }, e)).toBe(false);
  });
});

describe('scoreCase (per-case columns)', () => {
  it('must_find with one match: pass, recall 1, precision 1, citation over kept + dropped', () => {
    const r = scoreCase(mustFind(), [kept(12, 14), kept(50, 60)], 2);
    expect(r.pass).toBe(true);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.citation_accuracy).toBe(0.5); // 2 kept / (2 kept + 2 dropped)
    expect(r.actual_output.dropped).toBe(2);
    expect(r.actual_output.findings.map((f) => f.matches)).toEqual([true, false]);
  });

  it('must_find with several matches is still one pass and precision 1', () => {
    const r = scoreCase(mustFind(), [kept(10, 11), kept(15, 16), kept(19, 25)], 0);
    expect(r.pass).toBe(true);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.actual_output.findings.every((f) => f.matches)).toBe(true);
  });

  it('must_find with only unmatched findings: fail, recall 0, precision null (no match to divide)', () => {
    const r = scoreCase(mustFind(), [kept(50, 60)], 0);
    expect(r.pass).toBe(false);
    expect(r.recall).toBe(0);
    expect(r.precision).toBeNull();
    expect(r.citation_accuracy).toBe(1);
  });

  it('must_find with no findings and nothing dropped: fail, recall 0, precision and citation null', () => {
    const r = scoreCase(mustFind(), [], 0);
    expect(r).toMatchObject({ pass: false, recall: 0, precision: null, citation_accuracy: null });
    expect(r.actual_output).toEqual({ findings: [], dropped: 0 });
  });

  it('must_not_flag with no match: pass, recall null, precision null', () => {
    const r = scoreCase(mustNotFlag(), [kept(50, 60)], 0);
    expect(r).toMatchObject({ pass: true, recall: null, precision: null, citation_accuracy: 1 });
  });

  it('must_not_flag with a match: fail, recall null, precision 0', () => {
    const r = scoreCase(mustNotFlag(), [kept(15, 16), kept(50, 60)], 0);
    expect(r).toMatchObject({ pass: false, recall: null, precision: 0 });
  });

  it('must_find with a finding 1 line off the range: pass, recall 1, matches true (tolerance)', () => {
    const r = scoreCase(mustFind(), [kept(1, 9)], 0);
    expect(r).toMatchObject({ pass: true, recall: 1, precision: 1 });
    expect(r.actual_output.findings.map((f) => f.matches)).toEqual([true]);
  });

  it('must_find with a finding 3 lines off the range: still a miss', () => {
    const r = scoreCase(mustFind(), [kept(1, 7)], 0);
    expect(r).toMatchObject({ pass: false, recall: 0, precision: null });
  });

  it('must_not_flag with a finding 1 line off the range: pass, the tolerance does not count against it', () => {
    const r = scoreCase(mustNotFlag(), [kept(1, 9), kept(21, 30)], 0);
    expect(r).toMatchObject({ pass: true, recall: null, precision: null });
    expect(r.actual_output.findings.map((f) => f.matches)).toEqual([false, false]);
  });

  it('citation is 0 when every finding was dropped', () => {
    const r = scoreCase(mustFind(), [], 3);
    expect(r.citation_accuracy).toBe(0);
  });

  it('copies the finding fields into actual_output and adds only `matches`', () => {
    const r = scoreCase(mustFind(), [kept(12, 14)], 0);
    expect(r.actual_output.findings[0]).toEqual({
      file: 'src/a.ts',
      start_line: 12,
      end_line: 14,
      title: 'finding 12-14',
      severity: 'WARNING',
      category: 'bug',
      matches: true,
    });
  });
});

describe('aggregateRun (R-SRV-18, R-SRV-20–R-SRV-23)', () => {
  type Row = Parameters<typeof aggregateRun>[0][number];
  const f = (matches: boolean) => ({ matches });
  const row = (over: Partial<Row>): Row => ({
    kind: 'must_find',
    error: null,
    pass: true,
    actual_output: { findings: [], dropped: 0 },
    cost_usd: 0.01,
    ...over,
  });

  it('computes the three metrics over a mixed fixture', () => {
    const r = aggregateRun([
      // must_find, three matches + one unmatched: TP += 3, kept 4
      row({ actual_output: { findings: [f(true), f(true), f(true), f(false)], dropped: 1 } }),
      // must_find, nothing matches: a recall miss, unmatched finding counts for citation only
      row({ pass: false, actual_output: { findings: [f(false)], dropped: 0 }, cost_usd: 0.02 }),
      // must_not_flag, one matching finding: FP += 1
      row({ kind: 'must_not_flag', pass: false, actual_output: { findings: [f(true)], dropped: 0 }, cost_usd: 0.03 }),
      // must_not_flag clean: pass
      row({ kind: 'must_not_flag', actual_output: { findings: [], dropped: 2 }, cost_usd: 0.04 }),
    ]);
    expect(r.recall).toBe(0.5); // 1 of 2 must_find cases has a match
    expect(r.precision).toBe(3 / 4); // TP 3, FP 1; the unmatched findings are in neither
    expect(r.citation_accuracy).toBe(6 / 9); // kept 4+1+1+0, dropped 1+0+0+2
    expect(r.cases_passed).toBe(2);
    expect(r.cases_errored).toBe(0);
    expect(r.cost_usd).toBeCloseTo(0.1, 10);
  });

  it('leaves errored rows out of every metric and counts them in cases_errored', () => {
    const r = aggregateRun([
      row({ actual_output: { findings: [f(true)], dropped: 0 } }),
      row({ error: 'boom', pass: null, actual_output: null, cost_usd: null }),
    ]);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.citation_accuracy).toBe(1);
    expect(r.cases_passed).toBe(1);
    expect(r.cases_errored).toBe(1);
    expect(r.cost_usd).toBe(0.01); // the errored row's null cost does not poison the sum
  });

  it('counts recall from the matching findings, not from the pass column', () => {
    const r = aggregateRun([
      row({ pass: false, actual_output: { findings: [f(true)], dropped: 0 } }),
      row({ pass: true, actual_output: { findings: [f(false)], dropped: 0 } }),
    ]);
    expect(r.recall).toBe(0.5);
  });

  it('treats a null actual_output on a non-errored row as zero findings', () => {
    const r = aggregateRun([row({ pass: false, actual_output: null })]);
    expect(r.recall).toBe(0);
    expect(r.precision).toBeNull();
    expect(r.citation_accuracy).toBeNull();
    expect(r.cases_passed).toBe(0);
  });

  it('returns null for each zero denominator', () => {
    // only must_not_flag rows: no recall; no matching finding anywhere: no precision
    const r = aggregateRun([row({ kind: 'must_not_flag', actual_output: { findings: [], dropped: 0 } })]);
    expect(r.recall).toBeNull();
    expect(r.precision).toBeNull();
    expect(r.citation_accuracy).toBeNull();
    expect(r.cases_passed).toBe(1);
  });

  it('returns all-null metrics and zero counts for no rows', () => {
    expect(aggregateRun([])).toEqual({
      recall: null,
      precision: null,
      citation_accuracy: null,
      cases_passed: 0,
      cases_errored: 0,
      cost_usd: null,
    });
  });

  it('returns null metrics, cases_errored n and null cost when every row errored', () => {
    const r = aggregateRun([
      row({ error: 'a', pass: null, actual_output: null, cost_usd: null }),
      row({ error: 'b', pass: null, actual_output: null, cost_usd: 0.5 }),
    ]);
    expect(r).toEqual({
      recall: null,
      precision: null,
      citation_accuracy: null,
      cases_passed: 0,
      cases_errored: 2,
      cost_usd: null,
    });
  });

  it('sums cost over non-errored rows and is null when any of them has a null cost', () => {
    expect(aggregateRun([row({ cost_usd: 0.25 }), row({ cost_usd: 0.5 })]).cost_usd).toBe(0.75);
    expect(aggregateRun([row({ cost_usd: 0.25 }), row({ cost_usd: null })]).cost_usd).toBeNull();
  });

  it('a zero cost is a number, not null', () => {
    expect(aggregateRun([row({ cost_usd: 0 })]).cost_usd).toBe(0);
  });
});

describe('outcomeOf', () => {
  it('is errored when error is set, whatever pass says', () => {
    expect(outcomeOf({ error: 'x', pass: true })).toBe('errored');
    expect(outcomeOf({ error: 'x', pass: null })).toBe('errored');
  });
  it('is pass / fail otherwise', () => {
    expect(outcomeOf({ error: null, pass: true })).toBe('pass');
    expect(outcomeOf({ error: null, pass: false })).toBe('fail');
  });
});

describe('rawDiffFromPatches', () => {
  it('skips a file with a null patch and builds the three header lines before each patch', () => {
    const raw = rawDiffFromPatches([
      { path: 'a.ts', patch: '@@ -1 +1 @@\n-a\n+b' },
      { path: 'bin.png', patch: null },
      { path: 'c.ts', patch: '@@ -1 +1 @@\n-c\n+d' },
    ]);
    expect(raw).toBe(
      [
        'diff --git a/a.ts b/a.ts',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1 +1 @@',
        '-a',
        '+b',
        'diff --git a/c.ts b/c.ts',
        '--- a/c.ts',
        '+++ b/c.ts',
        '@@ -1 +1 @@',
        '-c',
        '+d',
      ].join('\n'),
    );
    expect(raw).not.toContain('bin.png');
  });

  it('is empty when no file has a patch', () => {
    expect(rawDiffFromPatches([{ path: 'x', patch: null }])).toBe('');
    expect(rawDiffFromPatches([])).toBe('');
  });
});

describe('cutFileSection (R-SRV-3, R-SRV-4, R-SRV-8)', () => {
  /** One hunk of `body` context lines on the new side starting at `start`: body + 1 hunk lines. */
  const hunk = (start: number, body: number) =>
    [`@@ -${start},${body} +${start},${body} @@`, ...Array.from({ length: body }, (_, i) => ` l${start + i}`)].join('\n');
  const range = (start_line: number, end_line = start_line) => ({ start_line, end_line });

  const small = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 1111111..2222222 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,2 +1,3 @@',
    ' one',
    '+two',
    ' three',
    '@@ -40,1 +41,1 @@',
    '-old',
    '+new',
  ].join('\n');

  it('keeps every hunk under the limit, with the three header lines, and drops git\'s index line', () => {
    const out = cutFileSection(small, 'src/a.ts', range(1));
    expect(out).toBe(
      [
        'diff --git a/src/a.ts b/src/a.ts',
        '--- a/src/a.ts',
        '+++ b/src/a.ts',
        '@@ -1,2 +1,3 @@',
        ' one',
        '+two',
        ' three',
        '@@ -40,1 +41,1 @@',
        '-old',
        '+new',
      ].join('\n'),
    );
    expect(out).not.toContain('index ');
  });

  it('returns null when the file has no section', () => {
    expect(cutFileSection(small, 'src/missing.ts', range(1))).toBeNull();
    expect(cutFileSection('', 'src/a.ts', range(1))).toBeNull();
  });

  it('matches the exact diff --git header: a path suffix or prefix is another file', () => {
    expect(cutFileSection(small, 'a.ts', range(1))).toBeNull();
    expect(cutFileSection(small, 'src/a.t', range(1))).toBeNull();
  });

  it('returns null when the section has no hunk (a rename or binary entry)', () => {
    const raw = ['diff --git a/img.png b/img.png', 'index 1..2 100644', 'Binary files a/img.png and b/img.png differ'].join('\n');
    expect(cutFileSection(raw, 'img.png', range(1))).toBeNull();
  });

  it('stops at the next file section', () => {
    const raw = [small, 'diff --git a/src/b.ts b/src/b.ts', '--- a/src/b.ts', '+++ b/src/b.ts', '@@ -1 +1 @@', '-x', '+y'].join('\n');
    const out = cutFileSection(raw, 'src/a.ts', range(1))!;
    expect(out).not.toContain('src/b.ts');
    expect(out.endsWith('+new')).toBe(true);
    expect(cutFileSection(raw, 'src/b.ts', range(1))).toBe(
      ['diff --git a/src/b.ts b/src/b.ts', '--- a/src/b.ts', '+++ b/src/b.ts', '@@ -1 +1 @@', '-x', '+y'].join('\n'),
    );
  });

  it('ignores a trailing empty line instead of adding it to the last hunk', () => {
    const out = cutFileSection(`${small}\n`, 'src/a.ts', range(1))!;
    expect(out.endsWith('+new')).toBe(true);
    expect(out).toBe(cutFileSection(small, 'src/a.ts', range(1)));
  });

  it('works on the output of rawDiffFromPatches', () => {
    const raw = rawDiffFromPatches([
      { path: 'x.ts', patch: '@@ -1 +1 @@\n-a\n+b' },
      { path: 'src/a.ts', patch: '@@ -3,2 +3,2 @@\n a\n-b\n+c' },
    ]);
    expect(cutFileSection(raw, 'src/a.ts', range(3))).toBe(
      ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -3,2 +3,2 @@', ' a', '-b', '+c'].join('\n'),
    );
  });

  describe('above the hunk-line limit', () => {
    const head = ['diff --git a/big.ts b/big.ts', 'index 1..2 100644', '--- a/big.ts', '+++ b/big.ts'];
    // hunk A new-side 1..1000 (1001 lines), hunk B new-side 3000..3000+n-1 (n + 1 lines)
    const big = (bLines: number) => [...head, hunk(1, 1000), hunk(3000, bLines)].join('\n');

    it('uses 1,500 as the limit', () => {
      expect(FRAGMENT_CUT_LINES).toBe(1500);
    });

    it('keeps every hunk at exactly 1,500 hunk lines (the limit is exclusive)', () => {
      const raw = big(498); // 1001 + 499 = 1500
      const out = cutFileSection(raw, 'big.ts', range(5))!;
      expect(out).toContain('@@ -1,1000 +1,1000 @@');
      expect(out).toContain('@@ -3000,498 +3000,498 @@');
    });

    it('keeps only the overlapping hunk at 1,501 hunk lines, headers unchanged', () => {
      const raw = big(499); // 1001 + 500 = 1501
      const out = cutFileSection(raw, 'big.ts', range(5, 6))!;
      const lines = out.split('\n');
      expect(lines.slice(0, 4)).toEqual(['diff --git a/big.ts b/big.ts', '--- a/big.ts', '+++ b/big.ts', '@@ -1,1000 +1,1000 @@']);
      expect(lines).toHaveLength(4 + 1000);
      expect(out).not.toContain('@@ -3000');
      expect(out).not.toContain('index ');
    });

    it('keeps the other hunk when the finding is in it', () => {
      const out = cutFileSection(big(499), 'big.ts', range(3100, 3105))!;
      expect(out).toContain('@@ -3000,499 +3000,499 @@');
      expect(out).not.toContain('@@ -1,1000');
    });

    it('keeps both hunks when the finding spans them', () => {
      const out = cutFileSection(big(499), 'big.ts', range(900, 3001))!;
      expect(out).toContain('@@ -1,1000');
      expect(out).toContain('@@ -3000,499');
    });

    it('counts the touching ends of the hunk as overlap, and a line past them as none', () => {
      const raw = big(499); // hunk A covers 1..1000
      expect(cutFileSection(raw, 'big.ts', range(1000, 1200))).toContain('@@ -1,1000');
      expect(cutFileSection(raw, 'big.ts', range(1001, 2999))).toBeNull();
    });

    it('returns null when no hunk overlaps the finding', () => {
      expect(cutFileSection(big(499), 'big.ts', range(2000, 2100))).toBeNull();
    });
  });

  describe('hunk-header edge cases', () => {
    const wrap = (...body: string[]) => ['diff --git a/h.ts b/h.ts', '--- a/h.ts', '+++ b/h.ts', ...body].join('\n');
    /** A filler hunk that pushes the section above the limit so the overlap test applies. */
    const filler = hunk(5000, FRAGMENT_CUT_LINES);

    it('reads a header with no counts as a one-line new side', () => {
      const raw = wrap('@@ -7 +7 @@', '-a', '+b', filler);
      expect(cutFileSection(raw, 'h.ts', range(7))).toContain('@@ -7 +7 @@');
      expect(cutFileSection(raw, 'h.ts', range(8, 9))).toBeNull();
      expect(cutFileSection(raw, 'h.ts', range(5, 6))).toBeNull();
    });

    it('reads a header with only the old count as one new-side line', () => {
      const raw = wrap('@@ -7,3 +9 @@', ' a', filler);
      expect(cutFileSection(raw, 'h.ts', range(9))).toContain('@@ -7,3 +9 @@');
      expect(cutFileSection(raw, 'h.ts', range(10))).toBeNull();
    });

    it('gives a zero-length new side no range: a deletion hunk does not overlap the line it sits at', () => {
      const raw = wrap('@@ -7,2 +6,0 @@', '-a', '-b', filler);
      expect(cutFileSection(raw, 'h.ts', range(6, 6))).toBeNull();
    });

    it('keeps a zero-length hunk when the section is under the limit', () => {
      const raw = wrap('@@ -7,2 +6,0 @@', '-a', '-b');
      expect(cutFileSection(raw, 'h.ts', range(500))).toBe(raw);
    });

    it('keeps "\\ No newline at end of file" with its hunk and counts it as a hunk line', () => {
      const marker = '\\ No newline at end of file';
      const raw = wrap('@@ -1,2 +1,2 @@', ' a', '-b', '+c', marker, hunk(4000, FRAGMENT_CUT_LINES - 5));
      // 1 header + 4 body (incl. marker) + 1 + 1495 = 1501 hunk lines: one over the limit
      const out = cutFileSection(raw, 'h.ts', range(1, 2))!;
      expect(out.endsWith(marker)).toBe(true);
      expect(out).not.toContain('@@ -4000');
    });

    it('does not count the marker as a new hunk: one fewer line is exactly the limit and keeps both hunks', () => {
      const marker = '\\ No newline at end of file';
      const raw = wrap('@@ -1,2 +1,2 @@', ' a', '-b', '+c', marker, hunk(4000, FRAGMENT_CUT_LINES - 6));
      // 5 + 1 + 1494 = 1500
      const out = cutFileSection(raw, 'h.ts', range(1, 2))!;
      expect(out).toContain('@@ -4000');
    });
  });
});

describe('caseName (R-SRV-12)', () => {
  it('prefixes must-find and no-', () => {
    expect(caseName('must_find', 'SQL injection in login')).toBe('must-find-sql-injection-in-login');
    expect(caseName('must_not_flag', 'SQL injection in login')).toBe('no-sql-injection-in-login');
  });

  it('collapses runs of non-alphanumerics and trims leading and trailing dashes', () => {
    expect(caseName('must_find', '  --Unsafe `eval()` call!! ')).toBe('must-find-unsafe-eval-call');
  });

  it('falls back to "finding" for an empty title', () => {
    expect(caseName('must_find', '')).toBe('must-find-finding');
    expect(caseName('must_not_flag', '')).toBe('no-finding');
  });

  it('falls back to "finding" when the title has no a-z0-9 at all', () => {
    expect(caseName('must_find', '!!! --- ???')).toBe('must-find-finding');
    expect(caseName('must_find', '日本語')).toBe('must-find-finding');
  });

  it('cuts a 60-character title to 34 slug characters', () => {
    const title = 'a'.repeat(60);
    const name = caseName('must_find', title);
    expect(CASE_SLUG_MAX).toBe(34);
    expect(name).toBe(`must-find-${'a'.repeat(34)}`);
  });

  it('removes a trailing dash left by the cut', () => {
    // 33 letters, a space, then more text: the 34-char cut ends in "-"
    const title = `${'b'.repeat(33)} tail words`;
    const name = caseName('must_find', title);
    expect(name).toBe(`must-find-${'b'.repeat(33)}`);
    expect(name.endsWith('-')).toBe(false);
  });
});
