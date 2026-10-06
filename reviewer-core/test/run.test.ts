import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest } from '../src/index.js';

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses the server's mock LLM + git so we exercise the real
 * assemble → completeStructured → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the MockGitClient diff) + one
  // hallucinated finding (line 999) the grounding gate must drop.
  const fixture = {
    verdict: 'request_changes',
    summary: 'secret key committed',
    score: 38,
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'sk_live in diff',
        confidence: 0.98,
        kind: 'finding',
      },
      {
        id: 'f-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom finding on a line not in the diff',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not real',
        confidence: 0.3,
        kind: 'finding',
      },
    ],
  };

  it('single-pass: assembles, grounds, drops the hallucinated finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();

    const events: string[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      task: 'Review PR #482',
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.mode).toBe('single-pass');
    expect(outcome.grounding).toBe('1/2 passed');
    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.start_line).toBe(11);
    expect(outcome.dropped).toHaveLength(1);
    // Score is derived from the SURVIVING findings, not the model's self-reported
    // 38: one CRITICAL remains after grounding ⇒ 100 − 35 = 65.
    expect(outcome.review.score).toBe(65);
    // progress is surfaced (server bridges this onto SSE; runner logs it)
    expect(events.some((m) => m.includes('Citation grounding'))).toBe(true);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #5',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.score).toBe(100);
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('forwards sessionId to every LLM call (OpenRouter session grouping)', async () => {
    const seen: (string | undefined)[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seen.push(req.sessionId);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });

  describe('costUsd accumulation across map-reduce chunks', () => {
    const file = (name: string) =>
      `diff --git a/src/${name}.ts b/src/${name}.ts\n--- a/src/${name}.ts\n+++ b/src/${name}.ts\n@@ -1,1 +1,2 @@\n a\n+b`;
    const THREE_FILES = ['a', 'b', 'c'].map(file).join('\n');

    /** A provider whose Nth call reports `costs[N]` — null models an unpriced call. */
    const pricedAs = (costs: (number | null)[]): LLMProvider => {
      let call = 0;
      return {
        id: 'openrouter',
        async completeStructured<T>(req): Promise<StructuredResult<T>> {
          return {
            data: { verdict: 'approve', summary: 'ok', score: 100, findings: [] } as unknown as T,
            model: req.model,
            tokensIn: 10,
            tokensOut: 5,
            costUsd: costs[call++] ?? null,
            raw: '',
            attempts: 1,
          };
        },
        async listModels() {
          return [];
        },
        async complete() {
          throw new Error('not used');
        },
        async embed() {
          return [];
        },
      };
    };

    const run = async (costs: (number | null)[]) =>
      reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff: await new MockGitClient({ diff: THREE_FILES }).diff(),
        llm: pricedAs(costs),
        strategy: 'map-reduce',
      });

    it('sums the priced chunks', async () => {
      const outcome = await run([0.001, 0.002, 0.003]);
      expect(outcome.mode).toBe('map-reduce');
      expect(outcome.chunks).toHaveLength(3);
      expect(outcome.costUsd).toBeCloseTo(0.006, 10);
    });

    it('is null — not 0, not a partial sum — when any one chunk is unpriced', async () => {
      const outcome = await run([0.001, null, 0.003]);
      expect(outcome.chunks).toHaveLength(3);
      expect(outcome.costUsd).toBeNull();
    });

    it('stays null once unknown, even if the last chunk is priced', async () => {
      expect((await run([null, 0.002, 0.003])).costUsd).toBeNull();
    });
  });
});

/**
 * L03 — the `intent` slot and the scope filter at the engine level. The model
 * only TAGS `scope`; `reviewPullRequest` filters deterministically, once, after
 * grounding, and only when `scopeFilter === true`.
 */
describe('reviewPullRequest — intent slot and scope filter', () => {
  const INTENT = 'Summary: adds rate limiting.\nOut of scope: logging cleanup.';
  // MockGitClient's default diff: src/config.ts, new-side lines 10..12.
  const tagged = (id: string, over: Record<string, unknown>) => ({
    id,
    severity: 'WARNING',
    category: 'bug',
    title: `title ${id}`,
    file: 'src/config.ts',
    start_line: 11,
    end_line: 11,
    rationale: 'because',
    confidence: 0.8,
    kind: 'finding',
    ...over,
  });
  const TAGGED_FIXTURE = {
    verdict: 'request_changes',
    summary: 's',
    score: 50,
    findings: [
      tagged('in', { scope: 'in_scope', severity: 'WARNING' }), // kept (-12)
      tagged('sugg', { scope: 'out_of_scope', severity: 'SUGGESTION', start_line: 10, end_line: 10 }), // filtered
      tagged('crit', { scope: 'out_of_scope', severity: 'CRITICAL', category: 'security', confidence: 0.9 }), // signal (-35)
      tagged('crit-dup', { scope: 'out_of_scope', severity: 'CRITICAL', confidence: 0.5 }), // duplicate, filtered
      tagged('warn', { scope: 'out_of_scope', severity: 'WARNING', start_line: 12, end_line: 12 }), // filtered
      // fails grounding: dropped by grounding, never a signal
      tagged('ghost', { scope: 'out_of_scope', severity: 'CRITICAL', start_line: 999, end_line: 999 }),
    ],
  };

  // No `scope` anywhere: one grounded CRITICAL (line 11) and one hallucinated line (999).
  const UNTAGGED_FIXTURE = {
    verdict: 'request_changes',
    summary: 's',
    score: 38,
    findings: [
      tagged('plain', { severity: 'CRITICAL', category: 'security' }),
      tagged('ghost-plain', { start_line: 999, end_line: 999 }),
    ],
  };

  const run = async (extra: Record<string, unknown>, events?: { kind: string; msg: string }[]) =>
    reviewPullRequest({
      systemPrompt: 'reviewer',
      model: 'gpt-4.1',
      diff: await new MockGitClient().diff(),
      llm: new MockLLMProvider('openai', { structured: TAGGED_FIXTURE }),
      onEvent: events ? (e) => events.push({ kind: e.kind, msg: e.msg }) : undefined,
      ...extra,
    });

  const userMessageOf = (llm: MockLLMProvider, call: number): string => {
    const req = llm.calls.filter((c) => c.method === 'completeStructured')[call]!.req as {
      messages: { role: string; content: string }[];
    };
    return req.messages[1]!.content;
  };

  describe('intent reaches the prompt', () => {
    it('single-pass: the user message carries the intent section and the trace assembly records it', async () => {
      const llm = new MockLLMProvider('openai', { structured: UNTAGGED_FIXTURE });
      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff: await new MockGitClient().diff(),
        llm,
        prDescription: 'Adds rate limiting.',
        intent: INTENT,
      });
      const user = userMessageOf(llm, 0);
      expect(user).toContain('## PR intent (derived)');
      expect(user).toContain(`<untrusted source="pr-intent">\n${INTENT}\n</untrusted>`);
      expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## PR intent (derived)'));
      expect(user.indexOf('## PR intent (derived)')).toBeLessThan(user.indexOf('## Diff to review'));
      expect(outcome.assembly.intent).toBe(INTENT);
    });

    it('map-reduce: every per-file call carries the intent', async () => {
      const file = (name: string) =>
        `diff --git a/src/${name}.ts b/src/${name}.ts\n--- a/src/${name}.ts\n+++ b/src/${name}.ts\n@@ -1,1 +1,2 @@\n a\n+b`;
      const llm = new MockLLMProvider('openai', {
        structured: { verdict: 'approve', summary: 'ok', score: 100, findings: [] },
      });
      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff: await new MockGitClient({ diff: ['a', 'b', 'c'].map(file).join('\n') }).diff(),
        llm,
        strategy: 'map-reduce',
        intent: INTENT,
      });
      expect(outcome.mode).toBe('map-reduce');
      const calls = llm.calls.filter((c) => c.method === 'completeStructured');
      expect(calls).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        expect(userMessageOf(llm, i)).toContain(`<untrusted source="pr-intent">\n${INTENT}\n</untrusted>`);
      }
      expect(outcome.assembly.intent).toBe(INTENT);
    });

    it('without intent no intent section is sent and assembly.intent is null', async () => {
      const llm = new MockLLMProvider('openai', { structured: UNTAGGED_FIXTURE });
      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff: await new MockGitClient().diff(),
        llm,
      });
      expect(userMessageOf(llm, 0)).not.toContain('## PR intent (derived)');
      expect(outcome.assembly.intent).toBeNull();
    });
  });

  describe('scopeFilter: true', () => {
    it('removes the filtered findings, keeps one signal, and scores from the kept ones', async () => {
      const outcome = await run({ scopeFilter: true });
      expect(outcome.review.findings.map((f) => f.id)).toEqual(['in', 'crit']);
      // the signal is the finding itself: severity and tag unchanged
      const signal = outcome.review.findings.find((f) => f.id === 'crit')!;
      expect(signal.severity).toBe('CRITICAL');
      expect(signal.scope).toBe('out_of_scope');
      // 100 − WARNING(12) − CRITICAL(35)
      expect(outcome.review.score).toBe(53);
      expect(outcome.filtered.map((d) => [d.finding.id, d.reason])).toEqual([
        ['sugg', 'out of scope (SUGGESTION)'],
        ['crit-dup', 'duplicate of out-of-scope signal'],
        ['warn', 'out of scope (WARNING)'],
      ]);
      expect(outcome.scope).toEqual({ enabled: true, tagged: 5, filtered: 3, signals: 1 });
    });

    it('the grounding string still counts grounding only; a tagged finding that fails grounding is never a signal', async () => {
      const outcome = await run({ scopeFilter: true });
      // 6 candidates, `ghost` (line 999) fails grounding: 5/6, not reduced by the filter
      expect(outcome.grounding).toBe('5/6 passed');
      expect(outcome.dropped.map((d) => d.finding.id)).toEqual(['ghost']);
      expect(outcome.filtered.map((d) => d.finding.id)).not.toContain('ghost');
      expect(outcome.review.findings.map((f) => f.id)).not.toContain('ghost');
      // `tagged` counts grounded findings only
      expect(outcome.scope!.tagged).toBe(5);
      expect(outcome.scope!.signals).toBe(1);
    });

    it('emits one info event per filtered finding and one result event with the totals', async () => {
      const events: { kind: string; msg: string }[] = [];
      await run({ scopeFilter: true }, events);
      const infos = events.filter((e) => e.kind === 'info' && e.msg.startsWith('scope filtered'));
      expect(infos.map((e) => e.msg)).toEqual([
        'scope filtered "title sugg" (SUGGESTION, src/config.ts:10): out of scope (SUGGESTION)',
        'scope filtered "title crit-dup" (CRITICAL, src/config.ts:11): duplicate of out-of-scope signal',
        'scope filtered "title warn" (WARNING, src/config.ts:12): out of scope (WARNING)',
      ]);
      const results = events.filter((e) => e.msg.startsWith('Scope filter:'));
      expect(results).toEqual([
        {
          kind: 'result',
          msg: 'Scope filter: 3 out-of-scope finding(s) filtered · 1 signal(s) kept',
        },
      ]);
    });

    it('is a no-op on untagged findings, but still reports the enabled state', async () => {
      const llm = new MockLLMProvider('openai', { structured: UNTAGGED_FIXTURE });
      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff: await new MockGitClient().diff(),
        llm,
        scopeFilter: true,
      });
      expect(outcome.review.findings).toHaveLength(1);
      expect(outcome.review.score).toBe(65);
      expect(outcome.filtered).toEqual([]);
      expect(outcome.scope).toEqual({ enabled: true, tagged: 0, filtered: 0, signals: 0 });
    });
  });

  describe('scopeFilter false or omitted', () => {
    for (const [label, extra] of [
      ['omitted', {}],
      ['false', { scopeFilter: false }],
    ] as const) {
      it(`${label}: nothing is filtered even though findings are tagged`, async () => {
        const events: { kind: string; msg: string }[] = [];
        const outcome = await run({ ...extra, intent: INTENT }, events);
        expect(outcome.review.findings.map((f) => f.id)).toEqual([
          'in',
          'sugg',
          'crit',
          'crit-dup',
          'warn',
        ]);
        // 100 − 12 − 3 − 35 − 35 − 12
        expect(outcome.review.score).toBe(3);
        expect(outcome.filtered).toEqual([]);
        expect(outcome.scope).toEqual({ enabled: false, tagged: 5, filtered: 0, signals: 0 });
        expect(outcome.grounding).toBe('5/6 passed');
        expect(events.some((e) => e.msg.includes('scope filtered') || e.msg.startsWith('Scope filter:'))).toBe(
          false,
        );
      });
    }

    it('with neither intent nor scopeFilter and untagged findings: filtered [] and scope null (unchanged behaviour)', async () => {
      const llm = new MockLLMProvider('openai', { structured: UNTAGGED_FIXTURE });
      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff: await new MockGitClient().diff(),
        llm,
      });
      expect(outcome.filtered).toEqual([]);
      expect(outcome.scope).toBeNull();
      expect(outcome.review.findings).toHaveLength(1);
      expect(outcome.grounding).toBe('1/2 passed');
    });
  });

  describe('map-reduce: the filter runs once over the merged findings', () => {
    const file = (name: string) =>
      `diff --git a/src/${name}.ts b/src/${name}.ts\n--- a/src/${name}.ts\n+++ b/src/${name}.ts\n@@ -1,1 +1,2 @@\n a\n+b`;

    /** Call N returns `perCall[N]`: two chunks each report a serious finding on the SAME lines. */
    const sequenced = (perCall: unknown[]): MockLLMProvider => {
      const llm = new MockLLMProvider('openai');
      let n = 0;
      llm.completeStructured = async function <T>(req: Parameters<typeof llm.completeStructured>[0]) {
        llm.calls.push({ method: 'completeStructured', req });
        const data = (req.schema as { parse: (x: unknown) => T }).parse(perCall[n++]);
        return {
          data,
          model: req.model,
          tokensIn: 1,
          tokensOut: 1,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      } as typeof llm.completeStructured;
      return llm;
    };
    const review = (findings: unknown[]) => ({ verdict: 'comment', summary: 's', score: 50, findings });
    const crit = (id: string, confidence: number) => ({
      id,
      severity: 'CRITICAL',
      category: 'bug',
      title: `title ${id}`,
      file: 'src/a.ts',
      start_line: 2,
      end_line: 2,
      rationale: 'r',
      confidence,
      kind: 'finding',
      scope: 'out_of_scope',
    });

    it('a duplicate that spans two chunks collapses to one signal, and the totals event is emitted once', async () => {
      const llm = sequenced([review([crit('from-a', 0.5)]), review([crit('from-b', 0.9)]), review([])]);
      const events: { kind: string; msg: string }[] = [];
      const outcome = await reviewPullRequest({
        systemPrompt: 's',
        model: 'm',
        diff: await new MockGitClient({ diff: ['a', 'b', 'c'].map(file).join('\n') }).diff(),
        llm,
        strategy: 'map-reduce',
        scopeFilter: true,
        onEvent: (e) => events.push({ kind: e.kind, msg: e.msg }),
      });
      expect(outcome.mode).toBe('map-reduce');
      expect(llm.calls).toHaveLength(3);
      // A per-chunk filter would keep both; one pass over the merged set keeps the more confident one.
      expect(outcome.review.findings.map((f) => f.id)).toEqual(['from-b']);
      expect(outcome.filtered.map((d) => [d.finding.id, d.reason])).toEqual([
        ['from-a', 'duplicate of out-of-scope signal'],
      ]);
      expect(outcome.scope).toEqual({ enabled: true, tagged: 2, filtered: 1, signals: 1 });
      expect(events.filter((e) => e.msg.startsWith('Scope filter:'))).toHaveLength(1);
    });
  });
});
