/**
 * The eval run executor (`modules/eval/run-executor.ts`), hermetic: a fake `EvalExecutorStore` and
 * a fake `review` engine, no database and no model (R-SRV-17, R-SRV-31, R-SRV-36, R-SRV-48, F16).
 * Plan: `specs/plans/eval-pipeline.md`, phase 6.
 */
import { describe, it, expect } from 'vitest';
import type {
  EvalCaseRecord,
  EvalConfigSnapshot,
  EvalExpectation,
  LLMProvider,
  UnifiedDiff,
} from '@devdigest/shared';
import type { ReviewInput, ReviewOutcome } from '@devdigest/reviewer-core';
import { EvalRunExecutor, type EvalRunJob } from '../src/modules/eval/run-executor.js';
import { aggregateRun } from '../src/modules/eval/domain.js';
import { renderSkillBlocks, taskLine } from '../src/modules/_shared/review-prompt.js';
import type {
  EvalExecutorStore,
  EvalLog,
  EvalResultRow,
  EvalRunFinish,
  EvalStoredResult,
} from '../src/modules/eval/ports.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';

const expectation = (kind: EvalExpectation['kind'] = 'must_find'): EvalExpectation => ({
  kind,
  file: 'src/a.ts',
  start_line: 10,
  end_line: 20,
  title: 'Expected',
  severity: 'WARNING',
  category: 'bug',
});

const caseRecord = (i: number, kind: EvalExpectation['kind'] = 'must_find'): EvalCaseRecord => ({
  id: `case-${i}`,
  owner_kind: 'agent',
  owner_id: 'agent-1',
  name: `${kind === 'must_find' ? 'must-find' : 'no'}-case-${i}`,
  input_diff: `diff-text-${i}`,
  input_files: ['src/a.ts'],
  input_meta: {
    pr_id: `pr-${i}`,
    pr_number: 100 + i,
    repo: 'acme/x',
    pr_title: `Title ${i}`,
    pr_body: i % 2 === 0 ? `Body ${i}` : null,
    pr_author: `author-${i}`,
    head_sha: 'abc',
  },
  expected_output: expectation(kind),
  source_finding_id: null,
  created_at: '2026-10-31T00:00:00.000Z',
});

const SNAPSHOT: EvalConfigSnapshot = {
  agent_version: 4,
  system_prompt: 'SNAPSHOT PROMPT',
  provider: 'openai',
  model: 'snap-model',
  strategy: 'map-reduce',
  skills: [{ name: 'sk-one', version: 2 }],
};
const SKILLS = [{ name: 'sk-one', version: 2, body: '  skill body one  ' }];

/** A parsed diff the fake `parseDiff` returns, so identity proves the case's diff text was parsed. */
const parsedOf = (raw: string): UnifiedDiff => ({ raw: `parsed:${raw}`, files: [] });

function outcome(findings: ReviewOutcome['review']['findings'] = [], dropped = 0, costUsd: number | null = 0.01): ReviewOutcome {
  return {
    review: { verdict: 'comment', summary: 's', score: 80, findings },
    grounding: '',
    dropped: Array.from({ length: dropped }, () => ({ finding: findings[0]!, reason: 'x' })),
    filtered: [],
    scope: null,
    mode: 'single-pass',
    assembly: {} as ReviewOutcome['assembly'],
    chunks: [],
    tokensIn: 1,
    tokensOut: 1,
    costUsd,
    raw: '',
  };
}

const matchingFinding = {
  id: 'f1',
  severity: 'WARNING' as const,
  category: 'bug' as const,
  title: 'Found',
  file: 'src/a.ts',
  start_line: 12,
  end_line: 12,
  rationale: 'r',
  confidence: 0.9,
  kind: 'finding' as const,
};

/** A store that keeps the rows in memory, in the order they were stored. */
function fakeStore(opts: { storeResult?: (row: EvalResultRow, n: number) => 'stored' | 'case_gone' | 'run_gone' } = {}) {
  const rows: EvalResultRow[] = [];
  const kinds = new Map<string, EvalExpectation['kind']>();
  const finishes: EvalRunFinish[] = [];
  let storeCalls = 0;
  const store: EvalExecutorStore = {
    async storeResult(_runId, row) {
      const verdict = opts.storeResult?.(row, storeCalls++) ?? 'stored';
      if (verdict === 'stored') rows.push(row);
      return verdict;
    },
    async resultsOf(): Promise<EvalStoredResult[]> {
      return rows.map((r) => ({
        case_id: r.caseId,
        kind: kinds.get(r.caseId) ?? 'must_find',
        error: r.error,
        pass: r.pass,
        actual_output: r.actualOutput,
        cost_usd: r.costUsd,
      }));
    },
    async finishRun(_runId, finish) {
      finishes.push(finish);
      return true;
    },
  };
  return { store, rows, kinds, finishes };
}

function fakeLog() {
  const lines: { fields: Record<string, unknown>; message: string }[] = [];
  const log: EvalLog = { info: (fields, message) => void lines.push({ fields, message }) };
  return { log, lines };
}

const llm: LLMProvider = new MockLLMProvider('openai');

const job = (cases: EvalCaseRecord[]): EvalRunJob => ({
  runId: 'run-1',
  agentId: 'agent-1',
  snapshot: SNAPSHOT,
  skills: SKILLS,
  cases,
  llm,
});

describe('EvalRunExecutor', () => {
  it('keeps at most 3 reviews in flight with 7 cases, and reviews all 7 (R-SRV-36)', async () => {
    const { store, rows, finishes } = fakeStore();
    let inFlight = 0;
    let peak = 0;
    let started = 0;
    const review = async (): Promise<ReviewOutcome> => {
      started++;
      inFlight++;
      peak = Math.max(peak, inFlight);
      // Yield long enough for every free worker to start before any call finishes.
      await new Promise((r) => setTimeout(r, 15));
      inFlight--;
      return outcome();
    };
    const executor = new EvalRunExecutor({ store, review, parseDiff: parsedOf });

    await executor.run(job(Array.from({ length: 7 }, (_, i) => caseRecord(i))), fakeLog().log);

    expect(started).toBe(7);
    expect(rows).toHaveLength(7);
    expect(peak).toBe(3);
    expect(finishes).toHaveLength(1);
  });

  it('passes the snapshot, the skill blocks, the parsed fragment, the description and the task line, and no other slot (R-SRV-17)', async () => {
    const { store } = fakeStore();
    const inputs: ReviewInput[] = [];
    const review = async (input: ReviewInput): Promise<ReviewOutcome> => {
      inputs.push(input);
      return outcome();
    };
    const executor = new EvalRunExecutor({ store, review, parseDiff: parsedOf });
    const cases = [caseRecord(0), caseRecord(1)]; // 0 has a body, 1 has none

    await executor.run(job(cases), fakeLog().log);

    expect(inputs).toHaveLength(2);
    const byDiff = new Map(inputs.map((i) => [i.diff.raw, i]));
    for (const c of cases) {
      const input = byDiff.get(`parsed:${c.input_diff}`)!;
      expect(input).toBeDefined();
      expect(input.systemPrompt).toBe('SNAPSHOT PROMPT');
      expect(input.model).toBe('snap-model');
      expect(input.strategy).toBe('map-reduce');
      expect(input.skills).toEqual(renderSkillBlocks(SKILLS));
      expect(input.skills).toEqual(['### sk-one (v2)\nskill body one']);
      expect(input.prDescription).toBe(c.input_meta.pr_body ?? undefined);
      expect(input.task).toBe(
        taskLine({ number: c.input_meta.pr_number, title: c.input_meta.pr_title, author: c.input_meta.pr_author }),
      );
      expect(input.llm).toBe(llm);
      for (const slot of ['callers', 'repoMap', 'specs', 'memory', 'intent', 'scopeFilter', 'onEvent'] as const) {
        expect(input[slot], slot).toBeUndefined();
      }
    }
    expect(byDiff.get('parsed:diff-text-1')!.prDescription).toBeUndefined();
    expect(byDiff.get('parsed:diff-text-0')!.prDescription).toBe('Body 0');
  });

  it('turns a throwing review into that case\'s errored row and leaves the other cases scored (R-SRV-31)', async () => {
    const { store, rows, finishes } = fakeStore();
    const review = async (input: ReviewInput): Promise<ReviewOutcome> => {
      if (input.diff.raw === 'parsed:diff-text-1') throw new Error('model exploded');
      return outcome([matchingFinding]);
    };
    const executor = new EvalRunExecutor({ store, review, parseDiff: parsedOf });

    await executor.run(job([caseRecord(0), caseRecord(1), caseRecord(2)]), fakeLog().log);

    expect(rows).toHaveLength(3);
    const errored = rows.find((r) => r.caseId === 'case-1')!;
    expect(errored).toMatchObject({ error: 'model exploded', pass: null, recall: null, precision: null, costUsd: null });
    for (const id of ['case-0', 'case-2']) {
      expect(rows.find((r) => r.caseId === id)).toMatchObject({ error: null, pass: true, recall: 1, precision: 1 });
    }
    // The run is done, aggregated over the two non-errored rows.
    expect(finishes).toHaveLength(1);
    expect(finishes[0]).toMatchObject({ cases_errored: 1, cases_passed: 2, recall: 1, precision: 1 });
    expect(finishes[0]).not.toHaveProperty('failed');
  });

  it('finishes the run failed with the first error when every case errored (R-SRV-32)', async () => {
    const { store, finishes } = fakeStore();
    const review = async (): Promise<ReviewOutcome> => {
      throw new Error('provider down');
    };
    const executor = new EvalRunExecutor({ store, review, parseDiff: parsedOf, concurrency: 1 });

    await executor.run(job([caseRecord(0), caseRecord(1)]), fakeLog().log);

    expect(finishes).toEqual([{ failed: 'All 2 cases failed: provider down', cases_errored: 2 }]);
  });

  it('ends done with null metrics when no row remains, because every case was deleted (Q10)', async () => {
    const { store, finishes } = fakeStore({ storeResult: () => 'case_gone' });
    const review = async (): Promise<ReviewOutcome> => outcome([matchingFinding]);
    const executor = new EvalRunExecutor({ store, review, parseDiff: parsedOf });

    await executor.run(job([caseRecord(0), caseRecord(1)]), fakeLog().log);

    expect(finishes).toEqual([
      { recall: null, precision: null, citation_accuracy: null, cases_passed: 0, cases_errored: 0, cost_usd: null },
    ]);
  });

  it('skips a deleted case silently and aggregates the stored rows only (R-SRV-48)', async () => {
    const { store, rows, finishes } = fakeStore({ storeResult: (row) => (row.caseId === 'case-1' ? 'case_gone' : 'stored') });
    const review = async (): Promise<ReviewOutcome> => outcome([matchingFinding]);
    const executor = new EvalRunExecutor({ store, review, parseDiff: parsedOf });

    await executor.run(job([caseRecord(0), caseRecord(1), caseRecord(2)]), fakeLog().log);

    expect(rows.map((r) => r.caseId).sort()).toEqual(['case-0', 'case-2']);
    expect(finishes).toHaveLength(1);
    expect(finishes[0]).toMatchObject({ cases_passed: 2, cases_errored: 0 });
  });

  it('stops quietly on run_gone: no further cases, no finishRun, and the promise resolves (F16, R-SRV-48)', async () => {
    const { store, finishes } = fakeStore({ storeResult: () => 'run_gone' });
    let reviews = 0;
    const review = async (): Promise<ReviewOutcome> => {
      reviews++;
      return outcome();
    };
    const executor = new EvalRunExecutor({ store, review, parseDiff: parsedOf, concurrency: 1 });
    const { log, lines } = fakeLog();

    await expect(executor.run(job(Array.from({ length: 5 }, (_, i) => caseRecord(i))), log)).resolves.toBeUndefined();

    expect(reviews).toBe(1);
    expect(finishes).toEqual([]);
    expect(lines).toHaveLength(2);
  });

  it('never rejects: a store failure outside a case ends the run failed with its message', async () => {
    const { store, finishes } = fakeStore();
    store.resultsOf = async () => {
      throw new Error('db unreachable');
    };
    const review = async (): Promise<ReviewOutcome> => outcome();
    const executor = new EvalRunExecutor({ store, review, parseDiff: parsedOf });

    await expect(executor.run(job([caseRecord(0)]), fakeLog().log)).resolves.toBeUndefined();

    expect(finishes).toEqual([{ failed: 'db unreachable' }]);
  });

  it('never rejects even when finishing the failed run also throws', async () => {
    const { store } = fakeStore();
    store.resultsOf = async () => {
      throw new Error('first');
    };
    store.finishRun = async () => {
      throw new Error('second');
    };
    const executor = new EvalRunExecutor({ store, review: async () => outcome(), parseDiff: parsedOf });

    await expect(executor.run(job([caseRecord(0)]), fakeLog().log)).resolves.toBeUndefined();
  });

  it('writes exactly two log lines, carrying ids, counts and metrics but no case or model text (NFR-5)', async () => {
    const { store, kinds } = fakeStore();
    const cases = [caseRecord(0), caseRecord(1, 'must_not_flag')];
    for (const c of cases) kinds.set(c.id, c.expected_output.kind);
    const review = async (): Promise<ReviewOutcome> => outcome([matchingFinding], 1, 0.25);
    const executor = new EvalRunExecutor({ store, review, parseDiff: parsedOf, concurrency: 1 });
    const { log, lines } = fakeLog();

    await executor.run(job(cases), log);

    expect(lines).toHaveLength(2);
    expect(lines[0]!.fields).toEqual({ runId: 'run-1', agentId: 'agent-1', cases: 2 });
    const end = lines[1]!.fields;
    expect(Object.keys(end).sort()).toEqual(
      ['citation', 'costUsd', 'durationMs', 'errored', 'passed', 'precision', 'recall', 'runId', 'status'].sort(),
    );
    expect(end).toMatchObject({ runId: 'run-1', status: 'done', errored: 0, costUsd: 0.5 });
    const text = JSON.stringify(lines);
    for (const secret of ['SNAPSHOT PROMPT', 'skill body one', 'diff-text-0', 'Body 0', 'Found']) {
      expect(text).not.toContain(secret);
    }
  });

  it('aggregates the same numbers the pure aggregate gives for the stored rows (R-SRV-18)', async () => {
    const { store, finishes, kinds } = fakeStore();
    const cases = [caseRecord(0), caseRecord(1, 'must_not_flag'), caseRecord(2)];
    for (const c of cases) kinds.set(c.id, c.expected_output.kind);
    // Case 0 and 1 get a matching finding (case 1 is a false positive), case 2 gets none.
    const review = async (input: ReviewInput): Promise<ReviewOutcome> =>
      input.diff.raw === 'parsed:diff-text-2' ? outcome([]) : outcome([matchingFinding]);
    const executor = new EvalRunExecutor({ store, review, parseDiff: parsedOf });

    await executor.run(job(cases), fakeLog().log);

    const expected = aggregateRun(await store.resultsOf('run-1'));
    expect(finishes).toEqual([expected]);
    expect(expected).toMatchObject({ recall: 0.5, precision: 0.5, cases_passed: 1, cases_errored: 0 });
  });
});
