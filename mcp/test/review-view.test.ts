import { describe, expect, it } from 'vitest';
import { MAX_AGENT_NAME, MAX_ID, MAX_PATH, MAX_RATIONALE, MAX_SUMMARY, MAX_TITLE } from '../src/constants.js';
import type { ApiFinding, ApiReview } from '../src/ports.js';
import { toReviewView } from '../src/review-view.js';

// Pure projection: values in, values out, no doubles.

type Severity = ApiFinding['severity'];

function finding(over: Partial<ApiFinding> = {}): ApiFinding {
  return {
    severity: 'WARNING',
    title: 'A finding',
    file: 'src/a.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'Because.',
    dismissed_at: null,
    ...over,
  };
}

function review(findings: ApiFinding[], over: Partial<ApiReview> = {}): ApiReview {
  return {
    run_id: 'run-1',
    agent_name: 'Security Reviewer',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'A summary.',
    score: 65,
    created_at: '2026-10-10T09:00:00.000Z',
    findings,
    ...over,
  };
}

type FindingView = { severity: Severity; title: string; file: string; line: number; end_line?: number; rationale: string };
const findingsOf = (view: Record<string, unknown>) => view.findings as FindingView[];

describe('toReviewView — order', () => {
  it('sorts by severity, then file, then line, with three or more findings per key', () => {
    const shuffled = [
      finding({ severity: 'SUGGESTION', file: 'a.ts', start_line: 1, title: 'sug-a1' }),
      finding({ severity: 'WARNING', file: 'b.ts', start_line: 30, title: 'warn-b30' }),
      finding({ severity: 'CRITICAL', file: 'b.ts', start_line: 5, title: 'crit-b5' }),
      finding({ severity: 'WARNING', file: 'a.ts', start_line: 9, title: 'warn-a9' }),
      finding({ severity: 'CRITICAL', file: 'a.ts', start_line: 100, title: 'crit-a100' }),
      finding({ severity: 'WARNING', file: 'b.ts', start_line: 4, title: 'warn-b4' }),
      finding({ severity: 'CRITICAL', file: 'a.ts', start_line: 20, title: 'crit-a20' }),
      finding({ severity: 'WARNING', file: 'a.ts', start_line: 10, title: 'warn-a10' }),
      finding({ severity: 'CRITICAL', file: 'b.ts', start_line: 2, title: 'crit-b2' }),
      finding({ severity: 'SUGGESTION', file: 'b.ts', start_line: 7, title: 'sug-b7' }),
      finding({ severity: 'SUGGESTION', file: 'a.ts', start_line: 3, title: 'sug-a3' }),
    ];

    const titles = findingsOf(toReviewView(review(shuffled), { limit: 20 })).map((f) => f.title);

    expect(titles).toEqual([
      'crit-a20',
      'crit-a100', // line 100 after line 20: numeric, not text, comparison
      'crit-b2',
      'crit-b5',
      'warn-a9',
      'warn-a10',
      'warn-b4',
      'warn-b30',
      'sug-a1',
      'sug-a3',
      'sug-b7',
    ]);
  });

  it('compares file names by code unit, so the order does not depend on the locale', () => {
    const view = toReviewView(
      review([
        finding({ file: 'a.ts', title: 'lower' }),
        finding({ file: 'B.ts', title: 'upper' }),
        finding({ file: '_c.ts', title: 'underscore' }),
      ]),
      { limit: 20 },
    );

    // 'B' (66) < '_' (95) < 'a' (97)
    expect(findingsOf(view).map((f) => f.title)).toEqual(['upper', 'underscore', 'lower']);
  });
});

describe('toReviewView — dismissed findings and counts', () => {
  it('leaves a dismissed finding out of the list and out of the counts, and keeps an accepted one', () => {
    const accepted = { ...finding({ title: 'accepted' }), accepted_at: '2026-10-10T10:00:00.000Z' } as ApiFinding;
    const view = toReviewView(
      review([
        finding({ severity: 'CRITICAL', title: 'dismissed', dismissed_at: '2026-10-10T10:00:00.000Z' }),
        accepted,
        finding({ severity: 'SUGGESTION', title: 'open' }),
      ]),
      { limit: 20 },
    );

    expect(findingsOf(view).map((f) => f.title)).toEqual(['accepted', 'open']);
    expect(view.counts).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 1 });
  });

  it('counts every non-dismissed finding by severity, ignoring min_severity and limit', () => {
    const all = [
      finding({ severity: 'CRITICAL', start_line: 1 }),
      finding({ severity: 'WARNING', start_line: 2 }),
      finding({ severity: 'WARNING', start_line: 3 }),
      finding({ severity: 'SUGGESTION', start_line: 4 }),
      finding({ severity: 'SUGGESTION', start_line: 5 }),
      finding({ severity: 'SUGGESTION', start_line: 6 }),
    ];

    const view = toReviewView(review(all), { minSeverity: 'WARNING', limit: 1 });

    expect(view.counts).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 3 });
    expect(findingsOf(view)).toHaveLength(1);
  });

  it('reports zero counts and an empty list for a review without findings', () => {
    const view = toReviewView(review([]), { limit: 20 });

    expect(view.counts).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(view.findings).toEqual([]);
    expect(view).not.toHaveProperty('truncated');
  });
});

describe('toReviewView — min_severity', () => {
  const mixed = [
    finding({ severity: 'CRITICAL', title: 'c', start_line: 1 }),
    finding({ severity: 'WARNING', title: 'w', start_line: 2 }),
    finding({ severity: 'SUGGESTION', title: 's', start_line: 3 }),
  ];

  it('WARNING drops the suggestions and keeps the critical and warning ones', () => {
    const view = toReviewView(review(mixed), { minSeverity: 'WARNING', limit: 20 });

    expect(findingsOf(view).map((f) => f.title)).toEqual(['c', 'w']);
    expect(view).not.toHaveProperty('truncated');
  });

  it('CRITICAL keeps only the critical ones', () => {
    const view = toReviewView(review(mixed), { minSeverity: 'CRITICAL', limit: 20 });

    expect(findingsOf(view).map((f) => f.title)).toEqual(['c']);
  });

  it('SUGGESTION keeps everything', () => {
    const view = toReviewView(review(mixed), { minSeverity: 'SUGGESTION', limit: 20 });

    expect(findingsOf(view)).toHaveLength(3);
  });
});

describe('toReviewView — limit and truncation', () => {
  const five = Array.from({ length: 5 }, (_, i) => finding({ severity: 'WARNING', start_line: i + 1, title: `w${i + 1}` }));

  it('a limit below the count sets truncated and a note with the shown and total numbers, the run_id and min_severity', () => {
    const view = toReviewView(review(five, { run_id: 'run-abc' }), { limit: 2 });

    expect(findingsOf(view).map((f) => f.title)).toEqual(['w1', 'w2']);
    expect(view.truncated).toBe(true);
    expect(view.note).toBe(
      'Showing 2 of 5 findings, most severe first. Call get_findings with run_id "run-abc" and min_severity "WARNING", or a higher limit (max 50).',
    );
  });

  it('counts the findings that passed min_severity as the total, not all of them', () => {
    const view = toReviewView(
      review([...five, finding({ severity: 'SUGGESTION', start_line: 99 })]),
      { minSeverity: 'WARNING', limit: 3 },
    );

    expect(view.note).toEqual(expect.stringContaining('Showing 3 of 5 findings'));
  });

  it('has no truncated and no note key when nothing was cut, also when the limit equals the count', () => {
    const view = toReviewView(review(five), { limit: 5 });

    expect(findingsOf(view)).toHaveLength(5);
    expect(view).not.toHaveProperty('truncated');
    expect(view).not.toHaveProperty('note');
  });

  it('does not suggest a higher limit once the limit is already 50', () => {
    const many = Array.from({ length: 60 }, (_, i) => finding({ start_line: i + 1 }));

    const view = toReviewView(review(many), { limit: 50 });

    expect(findingsOf(view)).toHaveLength(50);
    expect(view.truncated).toBe(true);
    expect(view.note).toEqual(expect.stringContaining('Showing 50 of 60 findings'));
    expect(view.note).not.toEqual(expect.stringContaining('higher limit'));
  });

  it('does not suggest a narrower min_severity when it is already CRITICAL', () => {
    const crits = Array.from({ length: 4 }, (_, i) => finding({ severity: 'CRITICAL', start_line: i + 1 }));

    const view = toReviewView(review(crits), { minSeverity: 'CRITICAL', limit: 2 });

    expect(view.note).toEqual(expect.stringContaining('Showing 2 of 4 findings'));
    expect(view.note).not.toEqual(expect.stringContaining('min_severity'));
  });
});

describe('toReviewView — line numbers', () => {
  it('writes end_line only when it differs from line', () => {
    const view = toReviewView(
      review([
        finding({ file: 'a.ts', start_line: 12, end_line: 12 }),
        finding({ file: 'b.ts', start_line: 45, end_line: 52 }),
      ]),
      { limit: 20 },
    );

    const [single, range] = findingsOf(view);
    expect(single).toMatchObject({ file: 'a.ts', line: 12 });
    expect(single).not.toHaveProperty('end_line');
    expect(range).toMatchObject({ file: 'b.ts', line: 45, end_line: 52 });
  });
});

describe('toReviewView — caps', () => {
  it('cuts title, rationale and summary at their caps and ends the cut string with an ellipsis', () => {
    const view = toReviewView(
      review([finding({ title: 'T'.repeat(500), rationale: 'R'.repeat(1_000) })], { summary: 'S'.repeat(2_000) }),
      { limit: 20 },
    );

    const [f] = findingsOf(view);
    expect(f?.title).toHaveLength(MAX_TITLE);
    expect(f?.title.endsWith('…')).toBe(true);
    expect(f?.rationale).toHaveLength(MAX_RATIONALE);
    expect(f?.rationale.endsWith('…')).toBe(true);
    expect(view.summary).toHaveLength(MAX_SUMMARY);
    expect((view.summary as string).endsWith('…')).toBe(true);
  });

  it('leaves a string that is exactly at its cap alone', () => {
    const view = toReviewView(
      review([finding({ title: 'T'.repeat(MAX_TITLE), rationale: 'R'.repeat(MAX_RATIONALE) })], {
        summary: 'S'.repeat(MAX_SUMMARY),
      }),
      { limit: 20 },
    );

    const [f] = findingsOf(view);
    expect(f?.title).toBe('T'.repeat(MAX_TITLE));
    expect(f?.rationale).toBe('R'.repeat(MAX_RATIONALE));
    expect(view.summary).toBe('S'.repeat(MAX_SUMMARY));
  });
});

describe('toReviewView — path and agent caps (F3)', () => {
  it('cuts a file longer than MAX_PATH to MAX_PATH characters ending with an ellipsis', () => {
    const view = toReviewView(review([finding({ file: 'p'.repeat(MAX_PATH + 100) })]), { limit: 20 });

    const file = findingsOf(view)[0]?.file ?? '';
    expect(file).toHaveLength(MAX_PATH);
    expect(file.endsWith('…')).toBe(true);
  });

  it('leaves a file that is exactly MAX_PATH characters alone', () => {
    const exact = 'p'.repeat(MAX_PATH);

    const view = toReviewView(review([finding({ file: exact })]), { limit: 20 });

    expect(findingsOf(view)[0]?.file).toBe(exact);
  });

  it('cuts an agent_name longer than MAX_AGENT_NAME to MAX_AGENT_NAME characters ending with an ellipsis', () => {
    const view = toReviewView(review([], { agent_name: 'A'.repeat(MAX_AGENT_NAME + 50) }), { limit: 20 });

    const agent = view.agent as string;
    expect(agent).toHaveLength(MAX_AGENT_NAME);
    expect(agent.endsWith('…')).toBe(true);
  });

  it('leaves an agent_name that is exactly MAX_AGENT_NAME characters alone', () => {
    const exact = 'A'.repeat(MAX_AGENT_NAME);

    expect(toReviewView(review([], { agent_name: exact }), { limit: 20 }).agent).toBe(exact);
  });
});

describe('toReviewView — id and timestamp caps', () => {
  it('cuts run_id and reviewed_at longer than MAX_ID to MAX_ID characters ending with an ellipsis', () => {
    const view = toReviewView(review([], { run_id: 'i'.repeat(300), created_at: 'T'.repeat(300) }), { limit: 20 });

    for (const value of [view.run_id, view.reviewed_at] as string[]) {
      expect(value).toHaveLength(MAX_ID);
      expect(value.endsWith('…')).toBe(true);
    }
  });

  it('leaves run_id and reviewed_at that are exactly MAX_ID characters alone', () => {
    const id = 'i'.repeat(MAX_ID);
    const at = 'T'.repeat(MAX_ID);

    const view = toReviewView(review([], { run_id: id, created_at: at }), { limit: 20 });

    expect(view.run_id).toBe(id);
    expect(view.reviewed_at).toBe(at);
  });

  it('leaves a uuid run_id and an ISO timestamp untouched', () => {
    const uuid = '3f2b8c1e-7a4d-4e0b-9c55-1d2e3f4a5b6c';

    const view = toReviewView(review([], { run_id: uuid, created_at: '2026-10-10T09:00:00.123Z' }), { limit: 20 });

    expect(view.run_id).toBe(uuid);
    expect(view.reviewed_at).toBe('2026-10-10T09:00:00.123Z');
  });

  it('names the run_id in the truncation note at the same cap, with the note ending the way it did', () => {
    const many = Array.from({ length: 5 }, (_, i) => finding({ start_line: i + 1 }));
    const long = 'i'.repeat(300);

    const view = toReviewView(review(many, { run_id: long }), { limit: 2 });

    const cut = `${'i'.repeat(MAX_ID - 1)}…`;
    expect(view.note).toBe(
      `Showing 2 of 5 findings, most severe first. Call get_findings with run_id "${cut}" and min_severity "WARNING", or a higher limit (max 50).`,
    );
    expect(view.note).not.toContain('i'.repeat(MAX_ID));
  });

  it('keeps a null run_id null', () => {
    expect(toReviewView(review([], { run_id: null }), { limit: 20 }).run_id).toBeNull();
  });
});

describe('toReviewView — the fields of the review result', () => {
  it('maps a review with null verdict, score, summary, agent and run_id to null fields', () => {
    const view = toReviewView(
      review([], { verdict: null, score: null, summary: null, agent_name: null, run_id: null }),
      { limit: 20 },
    );

    expect(view).toMatchObject({
      status: 'done',
      run_id: null,
      agent: null,
      verdict: null,
      score: null,
      summary: null,
    });
  });

  it('maps an absent agent_name (nullish in the contract) to null as well', () => {
    const { agent_name: _omitted, ...rest } = review([]);

    const view = toReviewView(rest as ApiReview, { limit: 20 });

    expect(view.agent).toBeNull();
  });

  it('carries the verdict, score, summary, agent, run id and timestamp of the review as they are', () => {
    const view = toReviewView(review([finding({ severity: 'CRITICAL', title: 'Hardcoded key', file: 'src/config.ts', start_line: 12, end_line: 12 })]), {
      limit: 20,
    });

    expect(view).toEqual({
      status: 'done',
      run_id: 'run-1',
      agent: 'Security Reviewer',
      reviewed_at: '2026-10-10T09:00:00.000Z',
      verdict: 'request_changes',
      score: 65,
      summary: 'A summary.',
      counts: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
      findings: [{ severity: 'CRITICAL', title: 'Hardcoded key', file: 'src/config.ts', line: 12, rationale: 'Because.' }],
    });
  });

  it('writes none of the dropped fields, even when the input carries them', () => {
    const fat = {
      ...finding({ severity: 'CRITICAL' }),
      id: 'finding-id',
      review_id: 'review-id',
      category: 'security',
      suggestion: 'Rotate the key.',
      confidence: 0.9,
      kind: 'finding',
      scope: 'in_scope',
      trifecta_components: ['exfil_path'],
      evidence: [{ component: 'exfil_path', file: 'x', line: 1 }],
      accepted_at: null,
    } as ApiFinding;
    const fatReview = {
      ...review([fat]),
      id: 'review-id',
      pr_id: 'pr-id',
      agent_id: 'agent-id',
      model: 'gpt-4.1',
      grounding: '2/2 passed',
    } as ApiReview;

    const view = toReviewView(fatReview, { limit: 20 });

    expect(Object.keys(view).sort()).toEqual(
      ['agent', 'counts', 'findings', 'reviewed_at', 'run_id', 'score', 'status', 'summary', 'verdict'],
    );
    expect(Object.keys(findingsOf(view)[0] ?? {}).sort()).toEqual(['file', 'line', 'rationale', 'severity', 'title']);
    const text = JSON.stringify(view);
    for (const dropped of ['finding-id', 'review-id', 'pr-id', 'agent-id', 'Rotate the key', 'dismissed_at', 'gpt-4.1', '2/2 passed']) {
      expect(text).not.toContain(dropped);
    }
  });
});

describe('toReviewView — size', () => {
  it('serialises 50 findings with title, rationale, path and agent name at their caps to at most 36,000 characters', () => {
    const path = `${'d/'.repeat(MAX_PATH)}f.ts`; // longer than the cap: the cut is what bounds the size
    const findings = Array.from({ length: 50 }, (_, i) =>
      finding({
        severity: (['CRITICAL', 'WARNING', 'SUGGESTION'] as const)[i % 3] ?? 'WARNING',
        title: 'T'.repeat(MAX_TITLE + 80),
        rationale: 'R'.repeat(MAX_RATIONALE + 400),
        file: path,
        start_line: 100_000 + i,
        end_line: 200_000 + i,
      }),
    );

    const text = JSON.stringify(toReviewView(review(findings, { summary: 'S'.repeat(5_000), agent_name: 'A'.repeat(MAX_AGENT_NAME + 80) }), { limit: 50 }));

    expect(text.length).toBeLessThanOrEqual(36_000);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(findingsOf(parsed)).toHaveLength(50);
    expect(findingsOf(parsed)[0]?.file).toHaveLength(MAX_PATH);
    expect(parsed.agent).toHaveLength(MAX_AGENT_NAME);
  });
});
