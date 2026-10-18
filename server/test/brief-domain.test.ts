/**
 * Pure PR Brief rules (`modules/brief/domain.ts`): hunk ranges, the linked issue, findings
 * selection, the trim sequence, input statuses, validation of the model's answer and the caps.
 * No doubles: values in, values out. Spec: `server/specs/L05-pr-brief.md` (R-SRV-6 to R-SRV-18,
 * R-SRV-25 to R-SRV-32, "Input statuses by kind").
 */
import { describe, it, expect } from 'vitest';
import { BriefInput, BriefInputKind } from '@devdigest/shared';
import type { Risk, Severity } from '@devdigest/shared';
import {
  BriefModelOutput,
  capBrief,
  cutToTokens,
  findLinkedIssueNumber,
  fitToBudget,
  formatRanges,
  parseNewSideRanges,
  recordInputs,
  refPath,
  selectReviewFindings,
  validateDraft,
} from '../src/modules/brief/domain.js';
import type { BriefFacts, BriefOrigin, BriefTrims, LineRange } from '../src/modules/brief/domain.js';
import {
  DESCRIPTION_CUT_TOKENS,
  ISSUE_BODY_CUT_TOKENS,
  MAX_REVIEW_FINDINGS,
} from '../src/modules/brief/constants.js';

// ---------------------------------------------------------------- hunk ranges (R-SRV-15)

describe('parseNewSideRanges', () => {
  it('returns null for a file with no stored patch', () => {
    expect(parseNewSideRanges(null)).toBeNull();
  });

  it('reads the new-side range of each @@ header: end = start + count - 1', () => {
    const patch = [
      '@@ -1,3 +1,4 @@ function a()',
      ' context',
      '+added',
      '@@ -20,2 +30,6 @@',
      '-gone',
      '+new',
    ].join('\n');
    expect(parseNewSideRanges(patch)).toEqual([
      { start: 1, end: 4 },
      { start: 30, end: 35 },
    ]);
  });

  it('treats a missing count as 1', () => {
    expect(parseNewSideRanges('@@ -5 +7 @@\n-a\n+b')).toEqual([{ start: 7, end: 7 }]);
  });

  it('leaves out a +c,0 hunk (a pure deletion has no new-side line)', () => {
    const patch = ['@@ -10,3 +9,0 @@', '-a', '-b', '-c', '@@ -40,1 +37,2 @@', '+x', '+y'].join('\n');
    expect(parseNewSideRanges(patch)).toEqual([{ start: 37, end: 38 }]);
  });

  it('gives an empty list when every hunk is a +c,0 hunk, and when there is no hunk', () => {
    expect(parseNewSideRanges('@@ -3,2 +2,0 @@\n-a\n-b')).toEqual([]);
    expect(parseNewSideRanges('')).toEqual([]);
  });

  it('reads nothing but real @@ headers: a changed line that looks like one is not a hunk', () => {
    const patch = ['@@ -1,2 +1,3 @@', ' ctx', '+@@ -1,2 +99,5 @@', '-@@ -1 +77,8 @@', '  @@ -1 +55,9 @@'].join('\n');
    expect(parseNewSideRanges(patch)).toEqual([{ start: 1, end: 3 }]);
  });
});

describe('formatRanges', () => {
  it('writes each range as +<start>..<end>', () => {
    expect(
      formatRanges([
        { start: 1, end: 4 },
        { start: 30, end: 35 },
      ]),
    ).toBe('+1..4 +30..35');
  });

  it('writes nothing for no range', () => {
    expect(formatRanges([])).toBe('');
  });
});

// ---------------------------------------------------------------- linked issue (R-SRV-31, Q1)

describe('findLinkedIssueNumber', () => {
  it('takes the first bare #N in text order', () => {
    expect(findLinkedIssueNumber('Closes #8, related to #3')).toBe(8);
    expect(findLinkedIssueNumber('#21 first\n\nthen #4')).toBe(21);
    expect(findLinkedIssueNumber('see (#14).')).toBe(14);
  });

  it('returns null when there is no reference', () => {
    expect(findLinkedIssueNumber('no reference here')).toBeNull();
    expect(findLinkedIssueNumber('')).toBeNull();
  });

  it.each([
    ['an HTML entity', 'it&#39;s fine'],
    ['a word glued to the hash', 'foo#12'],
    ['an owner/repo reference', 'see acme/api#5'],
    ['an issue URL', 'https://github.com/acme/api/issues/7'],
    ['a URL fragment', 'https://example.com/page#12'],
    ['issue 0', 'fixes #0'],
    ['a number followed by word characters', '#12abc'],
    ['a number followed by a dash', '#12-beta'],
  ])('ignores %s', (_label, text) => {
    expect(findLinkedIssueNumber(text)).toBeNull();
  });

  it('skips the references that do not count and takes the first one that does', () => {
    expect(findLinkedIssueNumber("it&#39;s foo#12, acme/api#5, #0 and then #9, #2")).toBe(9);
  });
});

// ---------------------------------------------------------------- review findings (R-SRV-14)

describe('selectReviewFindings', () => {
  const SEVERITIES: Severity[] = ['SUGGESTION', 'WARNING', 'CRITICAL'];

  it('caps at 20 from a fixture of 25, leaves dismissed ones out and orders CRITICAL, WARNING, SUGGESTION', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      file: `src/f${i}.ts`,
      line: i + 1,
      severity: SEVERITIES[i % 3] as Severity,
      title: `finding ${i}`,
      dismissed: i % 8 === 0, // 0, 8, 16, 24: four dismissed
    }));
    const lines = selectReviewFindings(rows);

    expect(lines).toHaveLength(MAX_REVIEW_FINDINGS);
    for (const dismissedIndex of [0, 8, 16, 24]) {
      expect(lines.some((l) => l.includes(`finding ${dismissedIndex}`))).toBe(false);
    }
    const severities = lines.map((l) => l.split(' ')[1]);
    const rank = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 } as Record<string, number>;
    const ranks = severities.map((s) => rank[s as string] as number);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(severities[0]).toBe('CRITICAL');
  });

  it('writes each finding as file:line severity title and keeps the stored order within a severity', () => {
    const lines = selectReviewFindings([
      { file: 'a.ts', line: 3, severity: 'WARNING', title: 'w one', dismissed: false },
      { file: 'b.ts', line: 9, severity: 'CRITICAL', title: 'c one', dismissed: false },
      { file: 'c.ts', line: 1, severity: 'WARNING', title: 'w two', dismissed: false },
      { file: 'd.ts', line: 2, severity: 'SUGGESTION', title: 's one', dismissed: false },
      { file: 'e.ts', line: 5, severity: 'CRITICAL', title: 'c two', dismissed: true },
    ]);
    expect(lines).toEqual([
      'b.ts:9 CRITICAL c one',
      'a.ts:3 WARNING w one',
      'c.ts:1 WARNING w two',
      'd.ts:2 SUGGESTION s one',
    ]);
  });

  it('returns nothing for no rows or only dismissed rows', () => {
    expect(selectReviewFindings([])).toEqual([]);
    expect(
      selectReviewFindings([{ file: 'a.ts', line: 1, severity: 'CRITICAL', title: 'x', dismissed: true }]),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------- cutToTokens

describe('cutToTokens', () => {
  const chars = (t: string) => t.length;

  it('returns the longest prefix with count <= max', () => {
    expect(cutToTokens('abcdefghij', 4, chars)).toBe('abcd');
  });

  it('returns the text whole when it already fits', () => {
    expect(cutToTokens('abc', 10, chars)).toBe('abc');
  });

  it('removes trailing whitespace from the cut', () => {
    expect(cutToTokens('abc   def', 5, chars)).toBe('abc');
  });

  it('returns an empty string when nothing fits', () => {
    expect(cutToTokens('abc', 0, chars)).toBe('');
  });

  it('counts with the given function, not by characters', () => {
    const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
    expect(cutToTokens('one two three four', 2, words)).toBe('one two');
  });
});

// ---------------------------------------------------------------- trim sequence (R-SRV-16 to R-SRV-18)

describe('fitToBudget', () => {
  const chars = (t: string) => t.length;

  function facts(over: Partial<BriefFacts> = {}): BriefFacts {
    return {
      title: 'Add rate limiting',
      intent: { summary: 'Limit requests', in_scope: ['api'], out_of_scope: ['ui'] },
      files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'].map((path) => ({
        path,
        role: 'core' as const,
        additions: 1,
        deletions: 0,
        ranges: [{ start: 1, end: 3 }],
      })),
      totals: { files: 4, additions: 4, deletions: 0 },
      blast: {
        summary: 'one symbol, five callers',
        totals: { symbols: 1, callers: 5, endpoints: 0, crons: 0, symbols_without_callers: 0 },
        callers: ['c1.ts:1 one', 'c2.ts:2 two', 'c3.ts:3 three', 'c4.ts:4 four', 'c5.ts:5 five'],
      },
      findings: ['a.ts:1 CRITICAL one', 'a.ts:2 WARNING two', 'a.ts:3 WARNING three', 'a.ts:4 SUGGESTION four'],
      description: 'd'.repeat(5000),
      issue: { number: 7, title: 'Issue', body: 'b'.repeat(3000) },
      documents: ['one', 'two', 'three'].map((n) => ({ path: `docs/${n}.md`, text: n })),
      ...over,
    };
  }

  // A measure with round numbers: a document weighs 1000, a finding 100, an issue body and the
  // description their length, a caller 10, a file 1. The title, the intent and the totals weigh
  // nothing, so a cut of any of them could never show up as a size change; the tests look at them.
  const measure = (f: BriefFacts): number =>
    f.documents.length * 1000 +
    f.findings.length * 100 +
    (f.issue?.body.length ?? 0) +
    (f.description?.length ?? 0) +
    (f.blast?.callers.length ?? 0) * 10 +
    f.files.length;
  // Full fixture: 3000 + 400 + 3000 + 5000 + 50 + 4 = 11454.

  const NO_TRIMS: BriefTrims = {
    documents: 0,
    findings: 0,
    issueBodyCut: false,
    issueDropped: false,
    descriptionCut: false,
    callers: 0,
    files: 0,
  };

  it('changes nothing when the input already fits', () => {
    const input = facts();
    const out = fitToBudget(input, measure, 20_000, chars);
    expect(out.facts).toEqual(input);
    expect(out.trims).toEqual(NO_TRIMS);
    expect(out.tokens).toBe(11454);
  });

  it('drops spec documents first, whole and from the last, and stops at the first fit', () => {
    const out = fitToBudget(facts(), measure, 9500, chars); // 11454 -> 10454 -> 9454
    expect(out.trims).toEqual({ ...NO_TRIMS, documents: 2 });
    expect(out.facts.documents.map((d) => d.path)).toEqual(['docs/one.md']);
    expect(out.facts.findings).toHaveLength(4);
    expect(out.tokens).toBe(9454);
  });

  it('drops findings from the end only after every document is gone, and before the linked issue', () => {
    // 8454 after the documents; each finding saves 100: 8354, 8254 <= 8300.
    const out = fitToBudget(facts(), measure, 8300, chars);
    expect(out.trims).toEqual({ ...NO_TRIMS, documents: 3, findings: 2 });
    expect(out.facts.documents).toEqual([]);
    expect(out.facts.findings).toEqual(['a.ts:1 CRITICAL one', 'a.ts:2 WARNING two']);
    expect(out.facts.issue?.body).toHaveLength(3000);
    expect(out.tokens).toBe(8254);
  });

  it('cuts the issue body to 1,000 tokens once the findings are gone', () => {
    const out = fitToBudget(facts(), measure, 8000, chars); // 8054 without findings, then 6054
    expect(out.trims).toEqual({ ...NO_TRIMS, documents: 3, findings: 4, issueBodyCut: true });
    expect(out.facts.findings).toEqual([]);
    expect(out.facts.issue).toEqual({ number: 7, title: 'Issue', body: 'b'.repeat(ISSUE_BODY_CUT_TOKENS) });
    expect(out.tokens).toBe(6054);
  });

  it('drops the whole issue when the cut body still does not fit', () => {
    const out = fitToBudget(facts(), measure, 5500, chars); // 6054, then 5054
    expect(out.trims).toEqual({ ...NO_TRIMS, documents: 3, findings: 4, issueBodyCut: true, issueDropped: true });
    expect(out.facts.issue).toBeNull();
    expect(out.tokens).toBe(5054);
  });

  it('goes straight to dropping an issue whose body is already short', () => {
    const out = fitToBudget(facts({ issue: { number: 7, title: 'Issue', body: 'b'.repeat(800) } }), measure, 5000, chars);
    expect(out.trims.issueBodyCut).toBe(false);
    expect(out.trims.issueDropped).toBe(true);
    expect(out.facts.issue).toBeNull();
  });

  it('cuts the description to 1,500 tokens after the issue', () => {
    const out = fitToBudget(facts(), measure, 3000, chars); // 5054, then 1554
    expect(out.trims).toEqual({
      ...NO_TRIMS,
      documents: 3,
      findings: 4,
      issueBodyCut: true,
      issueDropped: true,
      descriptionCut: true,
    });
    expect(out.facts.description).toHaveLength(DESCRIPTION_CUT_TOKENS);
    expect(out.facts.blast?.callers).toHaveLength(5);
    expect(out.tokens).toBe(1554);
  });

  it('drops blast callers one at a time from the end, keeping the summary and totals', () => {
    const input = facts();
    const out = fitToBudget(input, measure, 1520, chars); // 1554 -> 1544, 1534, 1524, 1514
    expect(out.trims.callers).toBe(4);
    expect(out.trims.files).toBe(0);
    expect(out.facts.blast?.callers).toEqual(['c1.ts:1 one']);
    expect(out.facts.blast?.summary).toBe(input.blast?.summary);
    expect(out.facts.blast?.totals).toEqual(input.blast?.totals);
    expect(out.tokens).toBe(1514);
  });

  it('drops changed files one at a time from the end, last of all', () => {
    const out = fitToBudget(facts(), measure, 1502, chars); // callers gone: 1504, then 1503, 1502
    expect(out.trims.callers).toBe(5);
    expect(out.trims.files).toBe(2);
    expect(out.facts.files.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
    expect(out.facts.blast?.callers).toEqual([]);
    expect(out.tokens).toBe(1502);
  });

  it('never cuts the title, the intent or the totals, even when nothing can make it fit', () => {
    const input = facts();
    const out = fitToBudget(input, measure, 0, chars);
    expect(out.facts.title).toBe(input.title);
    expect(out.facts.intent).toEqual(input.intent);
    expect(out.facts.totals).toEqual({ files: 4, additions: 4, deletions: 0 });
    expect(out.facts.files).toEqual([]);
    expect(out.trims.files).toBe(4);
    expect(out.tokens).toBeGreaterThan(0);
  });

  it('copes with facts that have no blast map, no issue, no description and no documents', () => {
    const bare = facts({ blast: null, issue: null, description: null, documents: [], findings: [] });
    const out = fitToBudget(bare, measure, 2, chars);
    expect(out.trims).toEqual({ ...NO_TRIMS, files: 2 });
    expect(out.facts.files.map((f) => f.path)).toEqual(['a.ts', 'b.ts']);
  });
});

// ---------------------------------------------------------------- input statuses (R-SRV-12 ...)

describe('recordInputs', () => {
  const ORIGIN: BriefOrigin = {
    intent: { present: true, stale: false },
    blast: { hasSymbols: true, reason: null },
    descriptionEmpty: false,
    issueMiss: null,
    documents: { attached: 3, read: 3, notCloned: false, allSkipped: false },
  };
  const NO_TRIMS: BriefTrims = {
    documents: 0,
    findings: 0,
    issueBodyCut: false,
    issueDropped: false,
    descriptionCut: false,
    callers: 0,
    files: 0,
  };

  const origin = (over: Partial<BriefOrigin> = {}): BriefOrigin => ({ ...ORIGIN, ...over });
  const trims = (over: Partial<BriefTrims> = {}): BriefTrims => ({ ...NO_TRIMS, ...over });
  const get = (o: BriefOrigin, t: BriefTrims, kind: BriefInputKind) =>
    recordInputs(o, t).find((i) => i.kind === kind);

  it('gives one entry per kind, in the order of the enum, each a valid BriefInput (R-SRV-12)', () => {
    const inputs = recordInputs(origin(), trims());
    expect(inputs.map((i) => i.kind)).toEqual(BriefInputKind.options);
    for (const i of inputs) expect(BriefInput.safeParse(i).success).toBe(true);
    expect(inputs.every((i) => i.status === 'used' && i.reason === null && i.omitted === null)).toBe(true);
  });

  describe('intent', () => {
    it('is used when derived and current (R-SRV-28)', () => {
      expect(get(origin(), trims(), 'intent')).toEqual({ kind: 'intent', status: 'used', reason: null, omitted: null });
    });

    it('is used with reason stale when the stored intent is stale (R-SRV-28)', () => {
      expect(get(origin({ intent: { present: true, stale: true } }), trims(), 'intent')).toEqual({
        kind: 'intent',
        status: 'used',
        reason: 'stale',
        omitted: null,
      });
    });

    it('is missing with reason not_derived when there is none', () => {
      expect(get(origin({ intent: { present: false, stale: false } }), trims(), 'intent')).toEqual({
        kind: 'intent',
        status: 'missing',
        reason: 'not_derived',
        omitted: null,
      });
    });
  });

  describe('blast_radius', () => {
    it('is used with the map degraded reason when the map has symbols (R-SRV-29)', () => {
      expect(
        get(origin({ blast: { hasSymbols: true, reason: 'index_partial' } }), trims(), 'blast_radius'),
      ).toEqual({ kind: 'blast_radius', status: 'used', reason: 'index_partial', omitted: null });
    });

    it('is missing with the map reason when it has no changed symbol (R-SRV-30)', () => {
      expect(
        get(origin({ blast: { hasSymbols: false, reason: 'repo_too_large' } }), trims(), 'blast_radius'),
      ).toEqual({ kind: 'blast_radius', status: 'missing', reason: 'repo_too_large', omitted: null });
    });

    it('is missing with no_data when it has no changed symbol and no reason (R-SRV-30)', () => {
      expect(get(origin({ blast: { hasSymbols: false, reason: null } }), trims(), 'blast_radius')).toEqual({
        kind: 'blast_radius',
        status: 'missing',
        reason: 'no_data',
        omitted: null,
      });
    });

    it('is trimmed over_budget with the number of callers left out', () => {
      expect(get(origin(), trims({ callers: 4 }), 'blast_radius')).toEqual({
        kind: 'blast_radius',
        status: 'trimmed',
        reason: 'over_budget',
        omitted: 4,
      });
    });

    it('records trimmed over_budget, not the degraded reason, when callers were dropped from a degraded map', () => {
      expect(
        get(origin({ blast: { hasSymbols: true, reason: 'index_partial' } }), trims({ callers: 2 }), 'blast_radius'),
      ).toEqual({ kind: 'blast_radius', status: 'trimmed', reason: 'over_budget', omitted: 2 });
    });
  });

  describe('diff_stats', () => {
    it('is trimmed over_budget with the number of files left out', () => {
      expect(get(origin(), trims({ files: 3 }), 'diff_stats')).toEqual({
        kind: 'diff_stats',
        status: 'trimmed',
        reason: 'over_budget',
        omitted: 3,
      });
    });
  });

  describe('description', () => {
    it('is missing with reason empty', () => {
      expect(get(origin({ descriptionEmpty: true }), trims(), 'description')).toEqual({
        kind: 'description',
        status: 'missing',
        reason: 'empty',
        omitted: null,
      });
    });

    it('is trimmed over_budget when cut to 1,500 tokens', () => {
      expect(get(origin(), trims({ descriptionCut: true }), 'description')).toEqual({
        kind: 'description',
        status: 'trimmed',
        reason: 'over_budget',
        omitted: null,
      });
    });
  });

  describe('linked_issue', () => {
    it.each(['none_linked', 'no_token', 'not_found', 'fetch_failed'] as const)(
      'is missing with reason %s (R-SRV-32)',
      (reason) => {
        expect(get(origin({ issueMiss: reason }), trims(), 'linked_issue')).toEqual({
          kind: 'linked_issue',
          status: 'missing',
          reason,
          omitted: null,
        });
      },
    );

    it('is trimmed over_budget when only its body was cut', () => {
      expect(get(origin(), trims({ issueBodyCut: true }), 'linked_issue')).toEqual({
        kind: 'linked_issue',
        status: 'trimmed',
        reason: 'over_budget',
        omitted: null,
      });
    });

    it('is missing over_budget when the budget dropped the whole issue', () => {
      expect(get(origin(), trims({ issueBodyCut: true, issueDropped: true }), 'linked_issue')).toEqual({
        kind: 'linked_issue',
        status: 'missing',
        reason: 'over_budget',
        omitted: null,
      });
    });
  });

  describe('spec_documents', () => {
    it('is missing none_attached when nothing is attached (R-SRV-25)', () => {
      expect(
        get(origin({ documents: { attached: 0, read: 0, notCloned: false, allSkipped: false } }), trims(), 'spec_documents'),
      ).toEqual({ kind: 'spec_documents', status: 'missing', reason: 'none_attached', omitted: null });
    });

    it('records none_attached, not not_cloned, when nothing is attached and the repository is not cloned', () => {
      expect(
        get(origin({ documents: { attached: 0, read: 0, notCloned: true, allSkipped: false } }), trims(), 'spec_documents'),
      ).toMatchObject({ status: 'missing', reason: 'none_attached' });
    });

    it('is missing not_cloned when paths are attached but the clone is missing (R-SRV-26)', () => {
      expect(
        get(origin({ documents: { attached: 2, read: 0, notCloned: true, allSkipped: false } }), trims(), 'spec_documents'),
      ).toEqual({ kind: 'spec_documents', status: 'missing', reason: 'not_cloned', omitted: null });
    });

    it('is missing all_skipped when every attached path was skipped by the read rules', () => {
      expect(
        get(origin({ documents: { attached: 2, read: 0, notCloned: false, allSkipped: true } }), trims(), 'spec_documents'),
      ).toEqual({ kind: 'spec_documents', status: 'missing', reason: 'all_skipped', omitted: null });
    });

    it('is trimmed over_budget with the number of documents left out', () => {
      expect(get(origin(), trims({ documents: 2 }), 'spec_documents')).toEqual({
        kind: 'spec_documents',
        status: 'trimmed',
        reason: 'over_budget',
        omitted: 2,
      });
    });

    it('is missing over_budget when every document read was dropped', () => {
      expect(get(origin(), trims({ documents: 3 }), 'spec_documents')).toMatchObject({
        kind: 'spec_documents',
        status: 'missing',
        reason: 'over_budget',
      });
    });
  });

  it('records with nothing attached and not cloned: spec_documents missing / none_attached (Q3)', () => {
    const inputs = recordInputs(
      origin({ documents: { attached: 0, read: 0, notCloned: true, allSkipped: false } }),
      trims(),
    );
    expect(inputs.find((i) => i.kind === 'spec_documents')).toMatchObject({
      status: 'missing',
      reason: 'none_attached',
    });
  });
});

// ---------------------------------------------------------------- references and validation

describe('refPath', () => {
  it.each([
    ['src/a.ts', 'src/a.ts'],
    ['src/a.ts:12', 'src/a.ts'],
    ['src/a.ts:12-18', 'src/a.ts'],
    ['./src/a.ts', 'src/a.ts'],
    ['./src/a.ts:12-18', 'src/a.ts'],
    ['././src/a.ts', './src/a.ts'],
  ])('%s -> %s', (ref, path) => {
    expect(refPath(ref)).toBe(path);
  });
});

describe('validateDraft', () => {
  const risk = (file_refs: string[], title = 'r'): BriefModelOutput['risks'][number] => ({
    kind: 'security',
    title,
    explanation: 'because',
    severity: 'high',
    file_refs,
  });
  const draft = (over: Partial<BriefModelOutput> = {}): BriefModelOutput => ({
    summary: 'does a thing',
    risks: [],
    review_focus: [],
    ...over,
  });
  const ctx = (
    files: Record<string, LineRange[] | null> = { 'src/a.ts': [{ start: 10, end: 20 }], 'src/b.ts': null },
    blast: string[] = ['lib/caller.ts'],
  ) => ({ changedFiles: new Map(Object.entries(files)), blastFiles: new Set(blast) });

  it('accepts a draft that satisfies the model output schema', () => {
    expect(BriefModelOutput.safeParse(draft({ risks: [risk(['src/a.ts'])] })).success).toBe(true);
    expect(BriefModelOutput.safeParse(draft({ summary: '' })).success).toBe(false);
  });

  describe('risks (R-SRV-6, R-SRV-7, R-SRV-10)', () => {
    it('keeps a risk that cites a changed file in any reference form, stored without the leading ./', () => {
      const out = validateDraft(
        draft({ risks: [risk(['src/a.ts']), risk(['src/a.ts:12']), risk(['src/a.ts:12-18']), risk(['./src/a.ts'])] }),
        ctx(),
      );
      expect(out.risks.map((r) => r.file_refs)).toEqual([
        ['src/a.ts'],
        ['src/a.ts:12'],
        ['src/a.ts:12-18'],
        ['src/a.ts'],
      ]);
      expect(out.dropped.risks).toBe(0);
    });

    it('keeps a risk that cites a blast caller file, which is not a changed file', () => {
      const out = validateDraft(draft({ risks: [risk(['lib/caller.ts:40'])] }), ctx());
      expect(out.risks).toHaveLength(1);
      expect(out.risks[0]?.file_refs).toEqual(['lib/caller.ts:40']);
    });

    it('keeps the valid references of a risk and removes the others', () => {
      const out = validateDraft(draft({ risks: [risk(['nope.ts:3', './src/b.ts:2', 'lib/caller.ts'])] }), ctx());
      expect(out.risks[0]?.file_refs).toEqual(['src/b.ts:2', 'lib/caller.ts']);
    });

    it('drops a risk with no valid reference, and one with no reference at all, and counts them', () => {
      const out = validateDraft(
        draft({ risks: [risk(['nope.ts']), risk(['src/a.ts'], 'kept'), risk([]), risk(['other/x.ts:1-2'])] }),
        ctx(),
      );
      expect(out.risks.map((r) => r.title)).toEqual(['kept']);
      expect(out.dropped.risks).toBe(3);
    });

    it('keeps the other fields of a kept risk', () => {
      const out = validateDraft(draft({ risks: [risk(['src/a.ts'], 'SQL injection')] }), ctx());
      expect(out.risks[0]).toEqual<Risk>({
        kind: 'security',
        title: 'SQL injection',
        explanation: 'because',
        severity: 'high',
        file_refs: ['src/a.ts'],
      });
    });
  });

  describe('review focus (R-SRV-8, R-SRV-9, R-SRV-10)', () => {
    const focus = (file: string, line: number) => ({ file, line, reason: 'look' });

    it('keeps a focus item only for a changed file, stored without the leading ./', () => {
      const out = validateDraft(
        draft({ review_focus: [focus('./src/a.ts', 12), focus('lib/caller.ts', 3), focus('nope.ts', 1), focus('src/b.ts', 5)] }),
        ctx(),
      );
      expect(out.review_focus.map((f) => f.file)).toEqual(['src/a.ts', 'src/b.ts']);
      expect(out.dropped.review_focus).toBe(2);
    });

    it('leaves a line inside a range unchanged', () => {
      const out = validateDraft(draft({ review_focus: [focus('src/a.ts', 10), focus('src/a.ts', 15), focus('src/a.ts', 20)] }), ctx());
      expect(out.review_focus.map((f) => f.line)).toEqual([10, 15, 20]);
    });

    describe('a line outside every range', () => {
      const ranges = { 'src/a.ts': [{ start: 10, end: 20 }, { start: 40, end: 50 }] };

      it.each([
        ['before the first range', 3, 10],
        ['nearer to the first range', 25, 10],
        ['nearer to the second range', 35, 40],
        ['after the last range', 99, 40],
        ['on a tie, goes to the earlier range', 30, 10],
      ])('%s: %i -> %i', (_label, line, expected) => {
        const out = validateDraft(draft({ review_focus: [focus('src/a.ts', line)] }), ctx(ranges));
        expect(out.review_focus[0]?.line).toBe(expected);
      });
    });

    it('keeps the line as given for a file with no stored patch', () => {
      const out = validateDraft(draft({ review_focus: [focus('src/b.ts', 777)] }), ctx());
      expect(out.review_focus[0]?.line).toBe(777);
    });

    it('keeps the line as given for a file whose hunks are all +c,0 (no new-side range)', () => {
      const ranges = parseNewSideRanges('@@ -3,2 +2,0 @@\n-a\n-b');
      const out = validateDraft(draft({ review_focus: [focus('src/d.ts', 55)] }), ctx({ 'src/d.ts': ranges }));
      expect(out.review_focus).toEqual([{ file: 'src/d.ts', line: 55, reason: 'look' }]);
    });
  });
});

// ---------------------------------------------------------------- caps (R-SRV-11)

describe('capBrief', () => {
  const risks = (n: number): Risk[] =>
    Array.from({ length: n }, (_, i) => ({
      kind: 'other',
      title: `risk ${i}`,
      explanation: 'e',
      severity: 'low' as const,
      file_refs: ['a.ts'],
    }));
  const focus = (n: number) => Array.from({ length: n }, (_, i) => ({ file: 'a.ts', line: i + 1, reason: `r${i}` }));

  it('keeps the first 6 risks and the first 6 focus items, in order, out of 9 and 8', () => {
    const out = capBrief('short', risks(9), focus(8));
    expect(out.risks.map((r) => r.title)).toEqual(['risk 0', 'risk 1', 'risk 2', 'risk 3', 'risk 4', 'risk 5']);
    expect(out.review_focus.map((f) => f.line)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps fewer than 6 whole', () => {
    const out = capBrief('short', risks(3), focus(2));
    expect(out.risks).toHaveLength(3);
    expect(out.review_focus).toHaveLength(2);
  });

  it('leaves a summary of up to 600 characters as it is', () => {
    const exactly = 'x'.repeat(600);
    expect(capBrief(exactly, [], []).summary).toBe(exactly);
  });

  it('cuts a longer summary to at most 600 characters at a word boundary', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`);
    const summary = words.join(' ');
    const out = capBrief(summary, [], []).summary;
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out.endsWith('…')).toBe(true);
    const kept = out.slice(0, -1);
    expect(summary.startsWith(kept)).toBe(true);
    // The cut falls between words: the last kept word is a whole one.
    expect(words).toContain(kept.split(' ').at(-1));
  });
});
