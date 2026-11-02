import { describe, it, expect } from 'vitest';
import {
  EvalExpectation,
  EvalCaseRecord,
  EvalSuiteRun,
  EvalCaseResult,
} from '@devdigest/shared';

/**
 * Eval pipeline contracts (R-SRV-42 / AC-92). Parsed through the `@devdigest/shared` barrel, so
 * the test also proves the barrel exports them.
 */

const location = {
  file: 'src/auth/session.ts',
  start_line: 10,
  end_line: 14,
  title: 'Token is never rotated',
  severity: 'CRITICAL' as const,
  category: 'security' as const,
};

const caseMeta = {
  pr_id: 'pr-1',
  pr_number: 482,
  repo: 'acme/web',
  pr_title: 'Add sessions',
  pr_body: null,
  pr_author: 'octocat',
  head_sha: 'abc123',
};

const caseRecord = {
  id: 'case-1',
  owner_kind: 'agent' as const,
  owner_id: 'agent-1',
  name: 'Token is never rotated',
  input_diff: 'diff --git a/x b/x',
  input_files: [],
  input_meta: caseMeta,
  expected_output: { kind: 'must_find' as const, ...location },
  notes: null,
  source_finding_id: null,
  created_at: '2026-10-31T10:00:00.000Z',
};

const suiteRun = {
  id: 'run-1',
  agent_id: 'agent-1',
  agent_name: 'Security Reviewer',
  status: 'done' as const,
  config: {
    agent_version: 3,
    system_prompt: 'You review code.',
    provider: 'anthropic' as const,
    model: 'claude-sonnet',
    strategy: 'single-pass' as const,
    skills: [{ name: 'owasp', version: 2 }],
  },
  recall: 0.5,
  precision: 1,
  citation_accuracy: 1,
  cases_total: 2,
  cases_done: 2,
  cases_passed: 1,
  cases_errored: 0,
  cost_usd: 0.0123,
  started_at: '2026-10-31T10:00:00.000Z',
  finished_at: '2026-10-31T10:01:00.000Z',
  error: null,
};

describe('EvalExpectation', () => {
  it.each(['must_find', 'must_not_flag'] as const)('accepts kind %s', (kind) => {
    const parsed = EvalExpectation.parse({ kind, ...location });
    expect(parsed.kind).toBe(kind);
    expect(parsed.file).toBe(location.file);
  });

  it('accepts a single-line range (start_line equal to end_line)', () => {
    expect(EvalExpectation.safeParse({ kind: 'must_find', ...location, start_line: 5, end_line: 5 }).success).toBe(
      true,
    );
  });

  it('rejects start_line greater than end_line', () => {
    const r = EvalExpectation.safeParse({ kind: 'must_find', ...location, start_line: 20, end_line: 10 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('start_line must be ≤ end_line');
  });

  it('rejects start_line 0', () => {
    expect(EvalExpectation.safeParse({ kind: 'must_find', ...location, start_line: 0 }).success).toBe(false);
  });

  it('rejects an empty file', () => {
    expect(EvalExpectation.safeParse({ kind: 'must_not_flag', ...location, file: '' }).success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(EvalExpectation.safeParse({ kind: 'should_find', ...location }).success).toBe(false);
  });
});

describe('EvalSuiteRun', () => {
  it('parses a finished run', () => {
    expect(EvalSuiteRun.parse(suiteRun).cases_total).toBe(2);
  });

  it('parses with recall, precision, citation_accuracy and cost_usd all null', () => {
    const parsed = EvalSuiteRun.parse({
      ...suiteRun,
      recall: null,
      precision: null,
      citation_accuracy: null,
      cost_usd: null,
    });
    expect(parsed.recall).toBeNull();
    expect(parsed.precision).toBeNull();
    expect(parsed.citation_accuracy).toBeNull();
    expect(parsed.cost_usd).toBeNull();
  });

  it('rejects a metric outside 0..1', () => {
    expect(EvalSuiteRun.safeParse({ ...suiteRun, recall: 1.2 }).success).toBe(false);
  });
});

describe('EvalCaseRecord', () => {
  it('parses an agent-owned case', () => {
    const parsed = EvalCaseRecord.parse(caseRecord);
    expect(parsed.owner_kind).toBe('agent');
    expect(parsed.expected_output.kind).toBe('must_find');
  });

  it("rejects owner_kind 'skill'", () => {
    expect(EvalCaseRecord.safeParse({ ...caseRecord, owner_kind: 'skill' }).success).toBe(false);
  });

  it('rejects an expected_output with start_line greater than end_line', () => {
    const bad = { ...caseRecord, expected_output: { kind: 'must_find', ...location, start_line: 30, end_line: 2 } };
    expect(EvalCaseRecord.safeParse(bad).success).toBe(false);
  });
});

describe('EvalCaseResult', () => {
  it('parses an errored result with null actual_output', () => {
    const parsed = EvalCaseResult.parse({
      id: 'res-1',
      case_id: 'case-1',
      ran_at: '2026-10-31T10:00:30.000Z',
      pass: null,
      recall: null,
      precision: null,
      citation_accuracy: null,
      duration_ms: null,
      cost_usd: null,
      suite_run_id: 'run-1',
      case_name: 'Token is never rotated',
      kind: 'must_find',
      expectation: { kind: 'must_find', ...location },
      outcome: 'errored',
      actual_output: null,
      error: 'boom',
    });
    expect(parsed.outcome).toBe('errored');
    expect(parsed.actual_output).toBeNull();
  });
});
