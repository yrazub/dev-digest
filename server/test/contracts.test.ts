import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  PrIntentRecord,
  PrIntentResponse,
  FEATURE_MODELS,
  PromptAssembly,
  BlastRadius,
  BlastRadiusResponse,
  BlastDegradedReason,
  Risks,
  PrHistory,
  SmartDiff,
  SmartDiffRole,
  Conformance,
  Onboarding,
  EvalRun,
  MemoryItem,
  RunTrace,
  RunStats,
  RunSummary,
  Settings,
  Repo,
  PrDetail,
  PrMeta,
  Skill,
  SkillCreate,
  SkillImportDraft,
  AgentSkill,
  Agent,
  ConventionCandidate,
  ConventionUpdate,
  ConventionSkillCreate,
  ContextDocPath,
  ContextDocStatus,
  ContextPathsInput,
  ContextSkipReason,
  SpecFile,
  ProjectContextList,
  ProjectContextFile,
  SkillContext,
  AgentContext,
  PrBrief,
  ReviewFocusItem,
  BriefInputReason,
  PrBriefRecord,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ summary: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('SmartDiff parses one group per role, in reading order', () => {
    const roles = ['core', 'tests', 'wiring', 'docs', 'boilerplate'] as const;
    const d = SmartDiff.parse({
      groups: roles.map((role) => ({
        role,
        files: [{ path: `${role}/a.ts`, additions: 1, deletions: 2, finding_lines: [] }],
      })),
      split_suggestion: { too_big: false, total_lines: 15, proposed_splits: [] },
    });
    expect(d.groups.map((g) => g.role)).toEqual([...roles]);
  });

  it('SmartDiffRole has the five values in reading order and rejects an unknown role', () => {
    expect(SmartDiffRole.options).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(SmartDiffRole.safeParse('generated').success).toBe(false);
    expect(
      SmartDiff.safeParse({
        groups: [{ role: 'generated', files: [] }],
        split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
      }).success,
    ).toBe(false);
  });

  it('Conformance / Onboarding / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      Onboarding.parse({
        sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: {
        duration_ms: 8200,
        tokens_in: 14820,
        tokens_out: 1240,
        cost_usd: 0.0013,
        findings: 3,
        grounding: '3/3 passed',
      },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
    expect(trace.stats.cost_usd).toBe(0.0013);
  });

  it('RunStats / RunSummary keep an unknown cost as null, never 0', () => {
    const stats = { duration_ms: 1, tokens_in: 1, tokens_out: 1, findings: 0, grounding: '0/0 passed' };
    expect(RunStats.parse({ ...stats, cost_usd: null }).cost_usd).toBeNull();
    // the key is always written by the server, so it is required (not optional)
    expect(() => RunStats.parse(stats)).toThrow();

    const summary = {
      run_id: 'r1',
      agent_id: null,
      agent_name: null,
      provider: 'openai',
      model: 'gpt-4.1',
      status: 'done',
      error: null,
      duration_ms: 1,
      tokens_in: 1,
      tokens_out: 1,
      findings_count: 0,
      findings_by_severity: null,
      grounding: '0/0 passed',
      ran_at: null,
      score: null,
      blockers: null,
    };
    expect(RunSummary.parse({ ...summary, cost_usd: 0.0013 }).cost_usd).toBe(0.0013);
    expect(RunSummary.parse({ ...summary, cost_usd: null }).cost_usd).toBeNull();
  });

  it('RunSummary carries a per-severity findings breakdown, required but nullable', () => {
    const summary = {
      run_id: 'r1',
      agent_id: null,
      agent_name: null,
      provider: 'openai',
      model: 'gpt-4.1',
      status: 'done',
      error: null,
      duration_ms: 1,
      tokens_in: 1,
      tokens_out: 1,
      cost_usd: 0.0013,
      findings_count: 3,
      grounding: '3/3 passed',
      ran_at: null,
      score: 61,
      blockers: 1,
    };
    // the key is always written by the server, so it is required (not optional)
    expect(() => RunSummary.parse(summary)).toThrow();
    const withBreakdown = {
      ...summary,
      findings_by_severity: { CRITICAL: 1, WARNING: 2, SUGGESTION: 0 },
    };
    expect(RunSummary.parse(withBreakdown).findings_by_severity).toEqual({
      CRITICAL: 1,
      WARNING: 2,
      SUGGESTION: 0,
    });
    expect(RunSummary.parse({ ...summary, findings_by_severity: null }).findings_by_severity).toBeNull();
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });

  it('PrMeta carries an optional findings breakdown + read-only preview', () => {
    const base = {
      number: 482,
      title: 't',
      author: 'a',
      branch: 'b',
      base: 'main',
      head_sha: 'sha',
      additions: 1,
      deletions: 0,
      files_count: 1,
      status: 'needs_review' as const,
    };
    // absent entirely (list endpoint, no completed run) — nullish, so omission parses fine
    expect(PrMeta.parse(base).findings_by_severity).toBeUndefined();
    expect(PrMeta.parse(base).findings_preview).toBeUndefined();

    const withBreakdown = PrMeta.parse({
      ...base,
      findings_by_severity: { CRITICAL: 1, WARNING: 1, SUGGESTION: 0 },
      findings_preview: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          confidence: 0.98,
        },
      ],
    });
    expect(withBreakdown.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });
    expect(withBreakdown.findings_preview).toHaveLength(1);
  });
});

describe('L02 skills contracts', () => {
  const skill = {
    id: 's1',
    name: 'breaking-change',
    description: 'Flag any removed or renamed field in a public response.',
    type: 'rubric',
    source: 'imported_file',
    body: '# Breaking change\n\nFlag it.',
    enabled: true,
    version: 2,
    evidence_files: null,
    agent_count: 1,
    created_at: '2026-09-28T10:00:00.000Z',
  };

  it('Skill accepts the imported_file source and requires agent_count', () => {
    expect(Skill.parse(skill).source).toBe('imported_file');
    const { agent_count: _dropped, ...withoutCount } = skill;
    expect(Skill.safeParse(withoutCount).success).toBe(false);
  });

  it('SkillCreate enforces a kebab-case name', () => {
    const base = { description: 'd', type: 'custom', body: 'b' };
    expect(SkillCreate.safeParse({ ...base, name: 'edge-cases' }).success).toBe(true);
    expect(SkillCreate.safeParse({ ...base, name: 'Edge Cases' }).success).toBe(false);
  });

  it('AgentSkill is a Skill plus link state', () => {
    const linked = AgentSkill.parse({ ...skill, linked: true, order: 0 });
    expect(linked.order).toBe(0);
    expect(AgentSkill.parse({ ...skill, linked: false, order: null }).linked).toBe(false);
  });

  it('SkillImportDraft lists ignored archive entries', () => {
    const draft = SkillImportDraft.parse({
      name: 'breaking-change',
      description: 'd',
      type: 'rubric',
      body: 'b',
      source: 'imported_file',
      ignored_files: ['scripts/run.sh'],
      warnings: [],
    });
    expect(draft.ignored_files).toEqual(['scripts/run.sh']);
  });

  it('Agent defaults skill_count to 0', () => {
    const agent = Agent.parse({
      id: 'a1',
      name: 'Test Quality Reviewer',
      description: '',
      provider: 'openai',
      model: 'gpt-4o-mini',
      system_prompt: 'Review tests.',
      enabled: true,
      version: 1,
    });
    expect(agent.skill_count).toBe(0);
  });
});

describe('L02 conventions contracts', () => {
  const candidate = {
    id: 'c1',
    category: 'error-handling',
    rule: 'Use async/await instead of .then() chains.',
    evidence_path: 'src/api/users.ts',
    evidence_line_start: 23,
    evidence_line_end: 31,
    evidence_snippet: 'const user = await db.users.find(id);',
    evidence_url: 'https://github.com/acme/api/blob/abc123/src/api/users.ts#L23-L31',
    confidence: 0.91,
    status: 'pending',
  };

  it('ConventionCandidate parses a verified candidate', () => {
    expect(ConventionCandidate.parse(candidate).status).toBe('pending');
  });

  it('ConventionCandidate rejects an unknown category and the old accepted flag shape', () => {
    expect(ConventionCandidate.safeParse({ ...candidate, category: 'style' }).success).toBe(false);
    const { status: _status, ...old } = candidate;
    expect(ConventionCandidate.safeParse({ ...old, accepted: true }).success).toBe(false);
  });

  it('ConventionUpdate needs at least one field and a non-blank rule', () => {
    expect(ConventionUpdate.safeParse({}).success).toBe(false);
    expect(ConventionUpdate.safeParse({ rule: '   ' }).success).toBe(false);
    expect(ConventionUpdate.parse({ status: 'rejected' }).status).toBe('rejected');
  });

  it('ConventionSkillCreate requires candidate ids and a kebab-case name', () => {
    const body = {
      candidate_ids: ['6f1c2a52-6f43-4b8a-9d1e-0c8c7b7f6a11'],
      name: 'repo-conventions',
      description: '3 house conventions extracted from api',
      type: 'convention',
      body: '# repo-conventions',
      enabled: true,
    };
    expect(ConventionSkillCreate.parse(body).name).toBe('repo-conventions');
    expect(ConventionSkillCreate.safeParse({ ...body, candidate_ids: [] }).success).toBe(false);
    expect(ConventionSkillCreate.safeParse({ ...body, name: 'Repo Conventions' }).success).toBe(false);
  });
});

describe('L03 intent layer contracts', () => {
  const record = {
    pr_id: 'p1',
    summary: 'Add a rate limit to the public webhooks route.',
    in_scope: ['rate limiting on /webhooks'],
    out_of_scope: ['auth changes'],
    risk_areas: [{ kind: 'security', label: 'public endpoint' }],
    confidence: 'medium',
    sources: [
      { kind: 'title', ref: null, status: 'used', reason: null },
      { kind: 'spec_document', ref: 'specs/rate-limit.md', status: 'unavailable', reason: 'not_found' },
    ],
    missing_context: true,
    injection_suspected: false,
    stale: false,
    model: 'deepseek/deepseek-v4-flash',
    cost_usd: 0.0004,
    computed_at: '2026-10-05T10:00:00.000Z',
  };

  it('Intent parses { summary, in_scope, out_of_scope } and rejects the old `intent` key alone', () => {
    const intent = Intent.parse({ summary: 's', in_scope: [], out_of_scope: [] });
    expect(intent.summary).toBe('s');
    expect(Intent.safeParse({ intent: 's', in_scope: [], out_of_scope: [] }).success).toBe(false);
  });

  it('PrIntentRecord parses a full record', () => {
    const parsed = PrIntentRecord.parse(record);
    expect(parsed.summary).toBe(record.summary);
    expect(parsed.sources).toHaveLength(2);
    expect(parsed.sources[1]).toEqual({
      kind: 'spec_document',
      ref: 'specs/rate-limit.md',
      status: 'unavailable',
      reason: 'not_found',
    });
  });

  it('PrIntentRecord keeps a null model and cost (unknown, never 0)', () => {
    const parsed = PrIntentRecord.parse({ ...record, model: null, cost_usd: null });
    expect(parsed.model).toBeNull();
    expect(parsed.cost_usd).toBeNull();
  });

  it.each([
    ['confidence', { confidence: 'certain' }],
    ['risk kind', { risk_areas: [{ kind: 'privacy', label: 'x' }] }],
    ['source status', { sources: [{ kind: 'title', ref: null, status: 'missing', reason: null }] }],
    ['source reason', { sources: [{ kind: 'title', ref: null, status: 'unavailable', reason: 'timeout' }] }],
    ['source kind', { sources: [{ kind: 'commit_message', ref: null, status: 'used', reason: null }] }],
  ])('PrIntentRecord rejects an unknown %s', (_name, override) => {
    expect(PrIntentRecord.safeParse({ ...record, ...override }).success).toBe(false);
  });

  it.each(['sources', 'missing_context', 'stale'])('PrIntentRecord requires `%s`', (key) => {
    const { [key]: _dropped, ...rest } = record as Record<string, unknown>;
    expect(PrIntentRecord.safeParse(rest).success).toBe(false);
  });

  it('PrIntentResponse accepts { intent: null } and a record, and rejects a missing key', () => {
    expect(PrIntentResponse.parse({ intent: null }).intent).toBeNull();
    expect(PrIntentResponse.parse({ intent: record }).intent?.pr_id).toBe('p1');
    expect(PrIntentResponse.safeParse({}).success).toBe(false);
  });

  describe('Finding.scope', () => {
    const finding = {
      id: 'f1',
      severity: 'WARNING',
      category: 'bug',
      title: 't',
      file: 'a.ts',
      start_line: 1,
      end_line: 2,
      rationale: 'r',
      confidence: 0.5,
    };

    it.each(['in_scope', 'out_of_scope'] as const)('parses scope %s', (scope) => {
      expect(Finding.parse({ ...finding, scope }).scope).toBe(scope);
    });

    it('parses with scope null and with scope absent', () => {
      expect(Finding.parse({ ...finding, scope: null }).scope).toBeNull();
      expect(Finding.parse(finding).scope).toBeUndefined();
    });

    it('rejects another scope value', () => {
      expect(Finding.safeParse({ ...finding, scope: 'unrelated' }).success).toBe(false);
    });
  });

  it('PromptAssembly parses with and without `intent`', () => {
    const base = { system: 's', user: 'u' };
    expect(PromptAssembly.parse(base).intent).toBeUndefined();
    expect(PromptAssembly.parse({ ...base, intent: null }).intent).toBeNull();
    expect(PromptAssembly.parse({ ...base, intent: 'Summary: x' }).intent).toBe('Summary: x');
  });

  it('RunStats parses with and without `scope_filtered`, and keeps it an integer', () => {
    const stats = {
      duration_ms: 1,
      tokens_in: 1,
      tokens_out: 1,
      cost_usd: null,
      findings: 0,
      grounding: '0/0 passed',
    };
    expect(RunStats.parse(stats).scope_filtered).toBeUndefined();
    expect(RunStats.parse({ ...stats, scope_filtered: null }).scope_filtered).toBeNull();
    expect(RunStats.parse({ ...stats, scope_filtered: 2 }).scope_filtered).toBe(2);
    expect(RunStats.safeParse({ ...stats, scope_filtered: 1.5 }).success).toBe(false);
  });

  it('FEATURE_MODELS review_intent defaults to the cheap OpenRouter classifier', () => {
    const entry = FEATURE_MODELS.find((m) => m.id === 'review_intent');
    expect(entry?.defaultProvider).toBe('openrouter');
    expect(entry?.defaultModel).toBe('deepseek/deepseek-v4-flash');
  });
});

describe('L04 blast radius contracts', () => {
  const core = {
    changed_symbols: [{ name: 'rateLimit', file: 'src/rate-limit.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'rateLimit',
        callers: [{ name: 'publicRouter', file: 'src/router.ts', line: 23 }],
        endpoints_affected: ['GET /webhooks'],
        crons_affected: ['nightly-sync'],
      },
    ],
    summary: '1 symbol changed; 1 caller, 1 endpoint, 1 cron.',
  };
  const body = {
    ...core,
    totals: { symbols: 1, callers: 1, endpoints: 1, crons: 1, symbols_without_callers: 0 },
    degraded: false,
    reason: null,
    indexed_sha: 'abc1234',
    caller_limit: 20,
  };

  it('BlastRadiusResponse parses a full body, and the same body parses as BlastRadius (B2)', () => {
    const parsed = BlastRadiusResponse.parse(body);
    expect(parsed.totals).toEqual(body.totals);
    expect(parsed.caller_limit).toBe(20);
    expect(BlastRadius.parse(body)).toEqual(core);
  });

  it('BlastDegradedReason has the six values in spec order', () => {
    expect(BlastDegradedReason.options).toEqual([
      'flag_off',
      'index_failed',
      'index_partial',
      'repo_too_large',
      'no_data',
      'pr_files_missing',
    ]);
  });

  it('accepts every reason on a degraded body', () => {
    for (const reason of BlastDegradedReason.options) {
      expect(BlastRadiusResponse.parse({ ...body, degraded: true, reason }).reason).toBe(reason);
    }
  });

  it('rejects an unknown reason', () => {
    expect(BlastRadiusResponse.safeParse({ ...body, degraded: true, reason: 'timeout' }).success).toBe(false);
    expect(BlastDegradedReason.safeParse('timeout').success).toBe(false);
  });

  it('keeps reason null and indexed_sha null (unknown, never an empty string)', () => {
    const parsed = BlastRadiusResponse.parse({ ...body, reason: null, indexed_sha: null });
    expect(parsed.reason).toBeNull();
    expect(parsed.indexed_sha).toBeNull();
  });

  it.each(['reason', 'indexed_sha', 'degraded', 'caller_limit', 'totals'])('requires `%s`', (key) => {
    const { [key]: _dropped, ...rest } = body as Record<string, unknown>;
    expect(BlastRadiusResponse.safeParse(rest).success).toBe(false);
  });

  it('rejects caller_limit 0 and a fractional caller_limit', () => {
    expect(BlastRadiusResponse.safeParse({ ...body, caller_limit: 0 }).success).toBe(false);
    expect(BlastRadiusResponse.safeParse({ ...body, caller_limit: 2.5 }).success).toBe(false);
  });

  it.each(['symbols', 'callers', 'endpoints', 'crons', 'symbols_without_callers'])('rejects a negative or fractional total.%s', (key) => {
    expect(
      BlastRadiusResponse.safeParse({ ...body, totals: { ...body.totals, [key]: -1 } }).success,
    ).toBe(false);
    expect(
      BlastRadiusResponse.safeParse({ ...body, totals: { ...body.totals, [key]: 1.5 } }).success,
    ).toBe(false);
  });

  it('rejects a body whose totals lack symbols_without_callers', () => {
    const { symbols_without_callers: _dropped, ...fourNumbers } = body.totals;
    expect(BlastRadiusResponse.safeParse({ ...body, totals: fourNumbers }).success).toBe(false);
  });

  it('accepts zero totals (an empty map)', () => {
    const empty = { symbols: 0, callers: 0, endpoints: 0, crons: 0, symbols_without_callers: 0 };
    expect(BlastRadiusResponse.parse({ ...body, totals: empty }).totals).toEqual(empty);
  });
});

describe('L05 project context contracts', () => {
  describe('ContextDocPath', () => {
    it.each(['docs/README.MD', 'specs/a.md', 'insights/deep/nested/note.md', 'docs/a.b.Md'])(
      'accepts %s (.md in any case)',
      (path) => {
        expect(ContextDocPath.safeParse(path).success).toBe(true);
      },
    );

    it.each([
      ['an absolute path', '/abs.md'],
      ['a parent segment', '../x.md'],
      ['a parent segment in the middle', 'specs/../x.md'],
      ['a leading ./', './specs/a.md'],
      ['a . segment in the middle', 'specs/./a.md'],
      ['an empty segment', 'specs//a.md'],
      ['a trailing slash', 'specs/a.md/'],
      ['an empty string', ''],
      ['a bare .md-less name', 'specs/a'],
      ['another extension', 'specs/a.txt'],
      ['a newline', 'specs/a\n.md'],
      ['a double quote', 'specs/a".md'],
      ['a <', 'specs/a<b.md'],
      ['a >', 'specs/a>b.md'],
      ['a backslash', 'specs\\a.md'],
      ['a NUL', 'specs/a\u0000.md'],
      ['a DEL', 'specs/a\u007f.md'],
    ])('rejects %s', (_name, path) => {
      expect(ContextDocPath.safeParse(path).success).toBe(false);
    });

    it('accepts 512 characters and rejects 513', () => {
      const withLength = (n: number) => `docs/${'a'.repeat(n - 'docs/.md'.length)}.md`;
      expect(withLength(512)).toHaveLength(512);
      expect(ContextDocPath.safeParse(withLength(512)).success).toBe(true);
      expect(withLength(513)).toHaveLength(513);
      expect(ContextDocPath.safeParse(withLength(513)).success).toBe(false);
    });
  });

  describe('ContextPathsInput', () => {
    const paths = (n: number) => Array.from({ length: n }, (_, i) => `docs/doc-${i}.md`);

    it('accepts an empty list, a normal list and exactly 200 paths', () => {
      expect(ContextPathsInput.parse({ paths: [] }).paths).toEqual([]);
      expect(ContextPathsInput.parse({ paths: ['specs/a.md', 'docs/b.md'] }).paths).toEqual([
        'specs/a.md',
        'docs/b.md',
      ]);
      expect(ContextPathsInput.safeParse({ paths: paths(200) }).success).toBe(true);
    });

    it('rejects 201 paths', () => {
      expect(ContextPathsInput.safeParse({ paths: paths(201) }).success).toBe(false);
    });

    it('rejects a duplicate path', () => {
      expect(ContextPathsInput.safeParse({ paths: ['specs/a.md', 'specs/a.md'] }).success).toBe(false);
    });

    it('rejects a list holding an invalid path', () => {
      expect(ContextPathsInput.safeParse({ paths: ['specs/a.md', '../x.md'] }).success).toBe(false);
    });
  });

  describe('document shapes', () => {
    const doc = {
      path: 'specs/a.md',
      size: 120,
      updated_at: '2026-10-16T10:00:00.000Z',
      kind: 'specs',
      tokens: 30,
      status: 'ok',
    };

    it('ContextDocStatus has the three values', () => {
      expect(ContextDocStatus.options).toEqual(['ok', 'too_large', 'unreadable']);
    });

    it('SpecFile requires kind, tokens and status; tokens may be null, content may be absent', () => {
      expect(SpecFile.parse(doc).kind).toBe('specs');
      expect(SpecFile.parse({ ...doc, tokens: null, status: 'too_large' }).tokens).toBeNull();
      for (const key of ['kind', 'tokens', 'status']) {
        const { [key]: _dropped, ...rest } = doc as Record<string, unknown>;
        expect(SpecFile.safeParse(rest).success).toBe(false);
      }
      expect(SpecFile.safeParse({ ...doc, status: 'missing' }).success).toBe(false);
      expect(SpecFile.safeParse({ ...doc, tokens: -1 }).success).toBe(false);
    });

    const list = {
      state: 'ready',
      roots: ['specs', 'docs', 'insights'],
      documents: [doc, { ...doc, path: 'docs/big.md', tokens: null, status: 'too_large' }],
      total_tokens: 30,
      capped: false,
      cap: 1000,
      soft_cap_tokens: 4000,
      run_cap_tokens: 16000,
    };

    it('ProjectContextList parses a sample, accepts not_cloned, and carries no ref', () => {
      const parsed = ProjectContextList.parse({ ...list, ref: { branch: 'main', sha: 'abc' } });
      expect(parsed.documents).toHaveLength(2);
      expect(parsed.total_tokens).toBe(30);
      expect(parsed).not.toHaveProperty('ref');
      expect(ProjectContextList.shape).not.toHaveProperty('ref');
      expect(
        ProjectContextList.parse({ ...list, state: 'not_cloned', documents: [], total_tokens: 0 }).state,
      ).toBe('not_cloned');
    });

    it('ProjectContextList rejects an unknown state and a non-positive cap', () => {
      expect(ProjectContextList.safeParse({ ...list, state: 'cloning' }).success).toBe(false);
      expect(ProjectContextList.safeParse({ ...list, cap: 0 }).success).toBe(false);
      expect(ProjectContextList.safeParse({ ...list, total_tokens: -1 }).success).toBe(false);
    });

    const file = {
      ...doc,
      content: '# Title\n',
      used_by: { agents_direct: 1, agents_via_skill: 2, skills: 3 },
    };

    it('ProjectContextFile parses a sample, keeps content null, and carries no ref', () => {
      const parsed = ProjectContextFile.parse({ ...file, ref: { branch: 'main' } });
      expect(parsed.content).toBe('# Title\n');
      expect(parsed.used_by).toEqual({ agents_direct: 1, agents_via_skill: 2, skills: 3 });
      expect(parsed).not.toHaveProperty('ref');
      expect(ProjectContextFile.shape).not.toHaveProperty('ref');
      expect(ProjectContextFile.parse({ ...file, content: null, status: 'too_large', tokens: null }).content).toBeNull();
    });

    it('ProjectContextFile requires content (nullable) and used_by', () => {
      const { content: _c, ...noContent } = file;
      const { used_by: _u, ...noUsedBy } = file;
      expect(ProjectContextFile.safeParse(noContent).success).toBe(false);
      expect(ProjectContextFile.safeParse(noUsedBy).success).toBe(false);
    });

    it('SkillContext and AgentContext hold paths only; AgentContext has no inherited', () => {
      expect(SkillContext.parse({ paths: ['specs/a.md'] })).toEqual({ paths: ['specs/a.md'] });
      const agent = AgentContext.parse({ paths: ['specs/a.md'], inherited: [{ path: 'docs/x.md' }] });
      expect(agent).toEqual({ paths: ['specs/a.md'] });
      expect(AgentContext.shape).not.toHaveProperty('inherited');
      expect(AgentContext.safeParse({}).success).toBe(false);
    });
  });

  describe('PromptAssembly project-context fields', () => {
    const base = { system: 's', user: 'u' };
    const loaded = { path: 'specs/a.md', origin: 'skill', skill_name: 'api-rules', tokens: 12, text: '# A' };
    const skipped = { path: 'docs/b.md', origin: 'agent', skill_name: null, reason: 'over_cap' };

    it('a trace written before L05 (none of the four fields) still parses', () => {
      const parsed = PromptAssembly.parse(base);
      expect(parsed.specs_tokens).toBeUndefined();
      expect(parsed.specs_calls).toBeUndefined();
      expect(parsed.specs_loaded).toBeUndefined();
      expect(parsed.specs_skipped).toBeUndefined();
    });

    it('parses with the four fields set, and with them null', () => {
      const parsed = PromptAssembly.parse({
        ...base,
        specs_tokens: 12,
        specs_calls: 2,
        specs_loaded: [loaded],
        specs_skipped: [skipped],
      });
      expect(parsed.specs_tokens).toBe(12);
      expect(parsed.specs_calls).toBe(2);
      expect(parsed.specs_loaded).toEqual([loaded]);
      expect(parsed.specs_skipped).toEqual([skipped]);

      const nulls = PromptAssembly.parse({
        ...base,
        specs_tokens: null,
        specs_calls: null,
        specs_loaded: null,
        specs_skipped: null,
      });
      expect(nulls.specs_loaded).toBeNull();
      expect(nulls.specs_skipped).toBeNull();
    });

    it('RunTrace still parses the new fields inside prompt_assembly', () => {
      const trace = RunTrace.parse({
        config: { agent: 'A', version: 'v1', model: 'm', pr: 1, source: 'local' },
        stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: null, findings: 0, grounding: '0/0 passed' },
        prompt_assembly: { ...base, specs_loaded: [loaded] },
        tool_calls: [],
        raw_output: '{}',
        memory_pulled: [],
        specs_read: ['specs/a.md'],
        log: [],
      });
      expect(trace.prompt_assembly.specs_loaded?.[0]?.skill_name).toBe('api-rules');
      expect(trace.specs_read).toEqual(['specs/a.md']);
    });

    it('ContextSkipReason has the seven reasons', () => {
      expect(ContextSkipReason.options).toEqual([
        'not_found',
        'unreadable',
        'too_large',
        'empty',
        'outside_clone',
        'not_cloned',
        'over_cap',
      ]);
    });

    it('specs_skipped[].reason rejects an unknown reason', () => {
      expect(
        PromptAssembly.safeParse({ ...base, specs_skipped: [{ ...skipped, reason: 'timeout' }] }).success,
      ).toBe(false);
    });

    it('specs_loaded[].origin rejects an unknown origin and a negative token count', () => {
      expect(PromptAssembly.safeParse({ ...base, specs_loaded: [{ ...loaded, origin: 'repo' }] }).success).toBe(false);
      expect(PromptAssembly.safeParse({ ...base, specs_loaded: [{ ...loaded, tokens: -1 }] }).success).toBe(false);
    });
  });
});

describe('L05 PR brief contracts', () => {
  const brief = {
    summary: 'Adds a rate limit to the webhook route.',
    intent: { summary: 'Rate-limit webhooks', in_scope: ['webhooks'], out_of_scope: [] },
    blast: {
      changed_symbols: [{ name: 'rateLimit', file: 'src/rate-limit.ts', kind: 'function' }],
      downstream: [],
      summary: '1 symbol changed.',
    },
    risks: {
      risks: [
        {
          kind: 'perf',
          title: 'Hot path',
          explanation: 'Runs on every request.',
          severity: 'medium' as const,
          file_refs: ['src/rate-limit.ts:12'],
        },
      ],
    },
    review_focus: [{ file: 'src/rate-limit.ts', line: 12, reason: 'The window is reset here.' }],
    history: { history: [] },
  };
  const stored = {
    ...brief,
    pr_id: '11111111-1111-1111-1111-111111111111',
    head_sha: 'a1b2c3d4e5f6',
    generated_at: '2026-10-18T00:00:00.000Z',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    tokens_in: 1200,
    tokens_out: 300,
    cost_usd: 0.0123,
    input_tokens: 1100,
    input_budget_tokens: 8000,
    inputs: [
      { kind: 'intent', status: 'used', reason: null, omitted: null },
      { kind: 'blast_radius', status: 'trimmed', reason: 'over_budget', omitted: 3 },
      { kind: 'spec_documents', status: 'missing', reason: 'none_attached', omitted: null },
    ],
    dropped: { risks: 0, review_focus: 1 },
  };
  const record = { ...stored, stale: false };

  describe('PrBrief', () => {
    it('parses a full brief', () => {
      const parsed = PrBrief.parse(brief);
      expect(parsed.review_focus).toEqual(brief.review_focus);
      expect(parsed.history).toEqual({ history: [] });
    });

    it('parses with intent: null and blast: null (the model was given no such input)', () => {
      const parsed = PrBrief.parse({ ...brief, intent: null, blast: null });
      expect(parsed.intent).toBeNull();
      expect(parsed.blast).toBeNull();
    });

    it.each(['summary', 'intent', 'blast', 'risks', 'review_focus', 'history'])('requires `%s`', (key) => {
      const { [key]: _omitted, ...rest } = brief as Record<string, unknown>;
      expect(PrBrief.safeParse(rest).success).toBe(false);
    });
  });

  describe('ReviewFocusItem', () => {
    const item = { file: 'src/a.ts', line: 1, reason: 'why' };

    it('parses the first line of a file', () => {
      expect(ReviewFocusItem.parse(item)).toEqual(item);
    });

    it('rejects line: 0', () => {
      expect(ReviewFocusItem.safeParse({ ...item, line: 0 }).success).toBe(false);
    });

    it('rejects a negative or fractional line', () => {
      expect(ReviewFocusItem.safeParse({ ...item, line: -3 }).success).toBe(false);
      expect(ReviewFocusItem.safeParse({ ...item, line: 2.5 }).success).toBe(false);
    });

    it('rejects an empty file', () => {
      expect(ReviewFocusItem.safeParse({ ...item, file: '' }).success).toBe(false);
    });
  });

  describe('PrBriefRecord', () => {
    it('parses a full record', () => {
      const parsed = PrBriefRecord.parse(record);
      expect(parsed.stale).toBe(false);
      expect(parsed.inputs).toHaveLength(3);
      expect(parsed.dropped).toEqual({ risks: 0, review_focus: 1 });
    });

    it('omit({ stale: true }) parses the stored form, which has no `stale`', () => {
      const parsed = PrBriefRecord.omit({ stale: true }).parse(stored);
      expect('stale' in parsed).toBe(false);
      expect(PrBriefRecord.safeParse(stored).success).toBe(false);
    });

    it('keeps null token counts and cost (unknown, never 0)', () => {
      const parsed = PrBriefRecord.parse({
        ...record,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        input_tokens: null,
      });
      expect([parsed.tokens_in, parsed.tokens_out, parsed.cost_usd, parsed.input_tokens]).toEqual([
        null,
        null,
        null,
        null,
      ]);
    });

    it('rejects a zero input budget', () => {
      expect(PrBriefRecord.safeParse({ ...record, input_budget_tokens: 0 }).success).toBe(false);
    });

    it.each([
      ['an unknown input kind', { inputs: [{ kind: 'diff', status: 'used', reason: null, omitted: null }] }],
      ['an unknown input status', { inputs: [{ kind: 'intent', status: 'skipped', reason: null, omitted: null }] }],
      ['an unknown input reason', { inputs: [{ kind: 'intent', status: 'missing', reason: 'timeout', omitted: null }] }],
      ['a negative omitted count', { inputs: [{ kind: 'intent', status: 'trimmed', reason: 'over_budget', omitted: -1 }] }],
      ['a negative dropped count', { dropped: { risks: -1, review_focus: 0 } }],
    ])('rejects %s', (_name, override) => {
      expect(PrBriefRecord.safeParse({ ...record, ...override }).success).toBe(false);
    });
  });

  describe('BriefInputReason', () => {
    it('holds the 17 values of the spec', () => {
      expect(BriefInputReason.options).toEqual([
        'not_derived',
        'stale',
        'flag_off',
        'index_failed',
        'index_partial',
        'repo_too_large',
        'no_data',
        'pr_files_missing',
        'empty',
        'none_linked',
        'no_token',
        'not_found',
        'fetch_failed',
        'none_attached',
        'not_cloned',
        'all_skipped',
        'over_budget',
      ]);
      expect(BriefInputReason.options).toHaveLength(17);
    });
  });
});
