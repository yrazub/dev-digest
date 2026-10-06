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
  Risks,
  PrHistory,
  SmartDiff,
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
