/**
 * `BriefService` (`modules/brief/service.ts`) with fake ports: an in-memory `BriefStore`, fakes
 * for the intent, blast and document sources, `MockLLMProvider` (or a scripted subclass where a
 * call must be held, thrown or delayed) and `MockGitHubClient`. Hermetic: no database, no
 * network, no key.
 * Spec: `server/specs/L05-pr-brief.md` (R-SRV-2, R-SRV-3, R-SRV-12 to R-SRV-14, R-SRV-19, R-SRV-20,
 * R-SRV-27 to R-SRV-37, R-SRV-39); plan: `specs/plans/L05-pr-brief.md`, phase 4.
 */
import { describe, it, expect, vi } from 'vitest';
import type {
  BlastRadiusResponse,
  FeatureModelChoice,
  PrBriefRecord,
  RepoRef,
  Severity,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { OutputTruncatedError } from '@devdigest/reviewer-core';
import { MockGitHubClient, MockLLMProvider, type MockGitHubOptions } from '../src/adapters/mocks.js';
import { AppError, ConfigError, ExternalServiceError, NotFoundError, ValidationError } from '../src/platform/errors.js';
import { BRIEF_SCHEMA_NAME, INPUT_BUDGET_TOKENS } from '../src/modules/brief/constants.js';
import type {
  BriefBlastSource,
  BriefDocumentSource,
  BriefIntentSource,
  BriefPull,
  BriefStore,
} from '../src/modules/brief/ports.js';
import { BriefService } from '../src/modules/brief/service.js';

// ------------------------------------------------------------------ fixtures

const WS = 'ws-1';
const PR = 'pr-1';
const HEAD = 'a1b2c3d4e5f6';
const NOW = new Date('2026-10-18T12:00:00.000Z');

// Text that must never reach a log line.
const TITLE_MARK = 'TITLEMARK-limiter';
const DESC_MARK = 'DESCMARK-token-bucket';
const DOC_MARK = 'DOCMARK-spec-text';
const MODEL_MARK = 'MODELMARK-summary';
const INTENT_MARK = 'INTENTMARK-scope';
const ISSUE_MARK = 'ISSUEMARK-body';

const PATCH = ['@@ -1,3 +1,8 @@ export function rateLimit()', ' keep', '+added'].join('\n');

const FILES = [
  { path: 'src/config.ts', additions: 3, deletions: 1, patch: '@@ -9,3 +9,5 @@\n keep\n+added' },
  { path: 'src/limiter.ts', additions: 30, deletions: 2, patch: PATCH },
];

const BLAST: BlastRadiusResponse = {
  changed_symbols: [{ name: 'rateLimit', file: 'src/limiter.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'rateLimit',
      callers: [{ name: 'boot', file: 'src/server.ts', line: 88 }],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: '1 symbol, 1 caller',
  totals: { symbols: 1, callers: 1, endpoints: 0, crons: 0, symbols_without_callers: 0 },
  degraded: false,
  reason: null,
  indexed_sha: 'abc123',
  caller_limit: 50,
};

const EMPTY_BLAST: BlastRadiusResponse = {
  changed_symbols: [],
  downstream: [],
  summary: 'no symbols',
  totals: { symbols: 0, callers: 0, endpoints: 0, crons: 0, symbols_without_callers: 0 },
  degraded: false,
  reason: null,
  indexed_sha: null,
  caller_limit: 50,
};

const INTENT = {
  summary: `Adds a limiter. ${INTENT_MARK}`,
  in_scope: ['Token bucket'],
  out_of_scope: ['Per-user limits'],
  stale: false,
};

/** A draft in which `validateDraft` removes one risk and one focus item. */
const DRAFT = {
  summary: `A rate limiter guards the API. ${MODEL_MARK}`,
  risks: [
    { kind: 'security', title: 'Key in config', explanation: 'A live key.', severity: 'high', file_refs: ['src/limiter.ts:5'] },
    { kind: 'breaking_api', title: 'Bootstrap wrapped', explanation: 'The server starts behind it.', severity: 'medium', file_refs: ['src/server.ts:88'] },
    { kind: 'other', title: 'Invented', explanation: 'No such file.', severity: 'low', file_refs: ['src/ghost.ts'] },
  ],
  review_focus: [
    { file: 'src/limiter.ts', line: 5, reason: 'entry point' },
    { file: 'src/ghost.ts', line: 3, reason: 'not in the PR' },
  ],
};

const PROVIDER_RESULT = { tokensIn: 100, tokensOut: 50, costUsd: 0.001, attempts: 1 };

const count = (text: string) => Math.ceil(text.length / 4);

function pullOf(over: Partial<BriefPull> = {}): BriefPull {
  return {
    id: PR,
    repoId: 'repo-1',
    title: `Add rate ${TITLE_MARK}`,
    body: `Adds a limiter. ${DESC_MARK}`,
    headSha: HEAD,
    additions: 33,
    deletions: 3,
    filesCount: 2,
    repo: { owner: 'acme', name: 'api', clonePath: '/clones/acme/api' },
    ...over,
  };
}

/** An in-memory `BriefStore`; `saves` records every write. */
class MemoryStore implements BriefStore {
  saves: Omit<PrBriefRecord, 'stale'>[] = [];
  row: Omit<PrBriefRecord, 'stale'> | undefined;
  unreadable = false;
  reads = 0;

  constructor(
    public pull: BriefPull | undefined,
    public files: { path: string; additions: number; deletions: number; patch: string | null }[],
    public findings: { file: string; line: number; severity: Severity; title: string; dismissed: boolean }[],
    public choice: FeatureModelChoice,
  ) {}

  async findPull(workspaceId: string, prId: string) {
    return this.pull && workspaceId === WS && prId === this.pull.id ? this.pull : undefined;
  }
  async changedFiles() {
    return this.files;
  }
  async latestReviewFindings() {
    return this.findings;
  }
  async featureModel() {
    return this.choice;
  }
  async readBrief(_prId: string, opts: { onUnreadable: () => void }) {
    this.reads += 1;
    if (this.unreadable) {
      opts.onUnreadable();
      return undefined;
    }
    return this.row;
  }
  async saveBrief(_prId: string, record: Omit<PrBriefRecord, 'stale'>) {
    this.saves.push(record);
    this.row = record;
  }
}

/** A provider whose structured call is scripted by the test. */
class ScriptedLLM extends MockLLMProvider {
  constructor(private readonly script: (req: StructuredRequest<unknown>) => Promise<StructuredResult<unknown>>) {
    super('openai');
  }
  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    return this.script(req as StructuredRequest<unknown>) as Promise<StructuredResult<T>>;
  }
}

const okResult = (data: unknown): StructuredResult<unknown> => ({
  data,
  model: 'gpt-4.1',
  raw: '',
  ...PROVIDER_RESULT,
});

/** Records the repository each `getIssue` call names. */
class RecordingGitHub extends MockGitHubClient {
  repos: RepoRef[] = [];
  override async getIssue(repo: RepoRef, n: number) {
    this.repos.push(repo);
    return super.getIssue(repo, n);
  }
}

interface LogLine {
  fields: Record<string, unknown>;
  message: string;
}

interface Setup {
  pull?: Partial<BriefPull> | null;
  files?: MemoryStore['files'];
  findings?: MemoryStore['findings'];
  intent?: (BriefIntentSourceResult) | null;
  blast?: BlastRadiusResponse | Error;
  documents?: Awaited<ReturnType<BriefDocumentSource['forWorkspace']>>;
  github?: MockGitHubOptions;
  noToken?: boolean;
  noKey?: boolean;
  llm?: MockLLMProvider;
  callTimeoutMs?: number;
  tokenizer?: { count(text: string): number };
}
type BriefIntentSourceResult = NonNullable<Awaited<ReturnType<BriefIntentSource['get']>>>;

function setup(o: Setup = {}) {
  const store = new MemoryStore(
    o.pull === null ? undefined : pullOf(o.pull),
    o.files ?? FILES,
    o.findings ?? [],
    { provider: 'openai', model: 'gpt-4.1' },
  );
  const llm = o.llm ?? new MockLLMProvider('openai', { structuredBySchema: { [BRIEF_SCHEMA_NAME]: DRAFT } });
  const github = new RecordingGitHub(o.github);
  const counters = { githubResolved: 0, providersRequested: [] as string[] };
  const intent = { get: vi.fn(async () => (o.intent === undefined ? INTENT : o.intent)) } satisfies BriefIntentSource;
  const blast: BriefBlastSource = {
    forPull: vi.fn(async () => {
      if (o.blast instanceof Error) throw o.blast;
      return o.blast ?? BLAST;
    }),
  };
  const documents: BriefDocumentSource = {
    forWorkspace: vi.fn(async () => o.documents ?? { attached: 0, notCloned: false, documents: [] }),
  };
  const service = new BriefService({
    store,
    intent,
    blast,
    documents,
    tokenizer: o.tokenizer ?? { count },
    github: async () => {
      counters.githubResolved += 1;
      if (o.noToken) throw new ConfigError('GITHUB_TOKEN is not configured');
      return github;
    },
    llm: async (p) => {
      counters.providersRequested.push(p);
      if (o.noKey) throw new ConfigError('OPENAI_API_KEY is not configured');
      return llm;
    },
    callTimeoutMs: o.callTimeoutMs,
    now: () => NOW,
  });
  const logs: LogLine[] = [];
  const log = { info: (fields: Record<string, unknown>, message: string) => void logs.push({ fields, message }) };
  return { service, store, llm, github, counters, intent, blast, documents, logs, log };
}

type Harness = ReturnType<typeof setup>;

const generate = (h: Harness) => h.service.generate(WS, PR, h.log);

const structuredCalls = (llm: MockLLMProvider) =>
  llm.calls.filter((c) => c.method === 'completeStructured').map((c) => c.req as StructuredRequest<unknown>);

const sentText = (req: StructuredRequest<unknown>) => req.messages.map((m) => m.content).join('\n');
const userText = (req: StructuredRequest<unknown>) => req.messages.find((m) => m.role === 'user')?.content ?? '';

const line = (h: Harness, message: string) => h.logs.filter((l) => l.message === message);
const CALL_LINE = 'Brief model call →';
const DONE_LINE = 'Brief model call done ←';

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error('expected the promise to reject');
}

// ------------------------------------------------------------------ the happy path

describe('BriefService.generate — one model call, stored with the head SHA', () => {
  it('answers the validated brief, stores it with the head SHA and call metadata, stale false (R-SRV-2, R-SRV-42)', async () => {
    const h = setup();
    const res = await generate(h);

    expect(h.store.saves).toHaveLength(1);
    const saved = h.store.saves[0]!;
    expect(saved).toMatchObject({
      pr_id: PR,
      head_sha: HEAD,
      generated_at: NOW.toISOString(),
      provider: 'openai',
      model: 'gpt-4.1',
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.001,
      input_budget_tokens: INPUT_BUDGET_TOKENS,
      history: { history: [] },
      dropped: { risks: 1, review_focus: 1 },
    });
    expect(saved.summary).toBe(DRAFT.summary);
    expect(saved.risks.risks.map((r) => r.title)).toEqual(['Key in config', 'Bootstrap wrapped']);
    expect(saved.review_focus).toEqual([{ file: 'src/limiter.ts', line: 5, reason: 'entry point' }]);
    expect(saved.inputs.map((i) => i.kind)).toEqual([
      'intent',
      'blast_radius',
      'diff_stats',
      'description',
      'linked_issue',
      'spec_documents',
    ]);
    // What was stored is what was answered, plus the computed flag.
    expect(res).toEqual({ brief: { ...saved, stale: false } });
  });

  it('logs the call line with the R-SRV-20 fields and exactly one done line with the provider numbers and real dropped counts', async () => {
    const h = setup({
      findings: [
        { file: 'src/config.ts', line: 12, severity: 'CRITICAL', title: 'Hardcoded key', dismissed: false },
        { file: 'src/limiter.ts', line: 3, severity: 'WARNING', title: 'Dismissed one', dismissed: true },
      ],
    });
    await generate(h);

    expect(h.logs.map((l) => l.message)).toEqual([CALL_LINE, DONE_LINE]);
    const [req] = structuredCalls(h.llm);
    const [call, done] = h.logs;
    expect(call!.fields).toMatchObject({
      prId: PR,
      provider: 'openai',
      model: 'gpt-4.1',
      // The counted prompt is the sent prompt.
      inputTokens: count(sentText(req!)),
      budgetTokens: INPUT_BUDGET_TOKENS,
      reviewFindings: 1,
      inputs: {
        intent: 'used',
        blast_radius: 'used',
        diff_stats: 'used',
        description: 'used',
        linked_issue: 'missing',
        spec_documents: 'missing',
      },
    });
    expect(done!.fields).toMatchObject({
      prId: PR,
      outcome: 'ok',
      reason: null,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      attempts: 1,
      dropped: { risks: 1, review_focus: 1 },
    });
    expect(done!.fields.ms).toEqual(expect.any(Number));
  });

  it('puts no pull-request text, document text, model text or intent text in either log line (R-SRV-20)', async () => {
    const h = setup({
      documents: { attached: 1, notCloned: false, documents: [{ path: 'specs/limiter.md', text: DOC_MARK }] },
      github: { issues: { 471: { number: 471, title: 'Rate limit', body: ISSUE_MARK, state: 'open' } } },
      pull: { body: `Adds a limiter. ${DESC_MARK} Closes #471.` },
    });
    await generate(h);

    // The marks did reach the prompt, so their absence from the log is meaningful.
    const [req] = structuredCalls(h.llm);
    for (const mark of [TITLE_MARK, DESC_MARK, DOC_MARK, INTENT_MARK, ISSUE_MARK]) {
      expect(sentText(req!)).toContain(mark);
    }
    const logged = JSON.stringify(h.logs);
    for (const mark of [TITLE_MARK, DESC_MARK, DOC_MARK, MODEL_MARK, INTENT_MARK, ISSUE_MARK, 'specs/limiter.md', 'src/limiter.ts']) {
      expect(logged).not.toContain(mark);
    }
  });

  it('makes one completeStructured call with reasoning false and the R-SRV-19 parameters, for the risk_brief choice', async () => {
    const h = setup();
    await generate(h);

    expect(h.counters.providersRequested).toEqual(['openai']);
    const reqs = structuredCalls(h.llm);
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({
      model: 'gpt-4.1',
      schemaName: BRIEF_SCHEMA_NAME,
      temperature: 0,
      maxTokens: 4000,
      maxRetries: 1,
      timeoutMs: 60_000,
      reasoning: false,
    });
    expect(reqs[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(reqs[0]!.signal!.aborted).toBe(false);
  });

  it('never calls intent.ensure or regenerate: the intent port has only get (R-SRV-27)', async () => {
    const h = setup();
    await generate(h);

    expect(h.intent.get).toHaveBeenCalledTimes(1);
    expect(h.intent.get).toHaveBeenCalledWith(WS, PR);
    expect(Object.keys(h.intent)).toEqual(['get']);
  });
});

// ------------------------------------------------------------------ failures

describe('BriefService.generate — failures write nothing and log one done line (R-SRV-20, R-SRV-23, R-SRV-34)', () => {
  const failedLine = (h: Harness, reason: string) => {
    expect(line(h, CALL_LINE)).toHaveLength(1);
    const done = line(h, DONE_LINE);
    expect(done).toHaveLength(1);
    expect(done[0]!.fields).toMatchObject({
      prId: PR,
      outcome: 'failed',
      reason,
      tokensIn: null,
      tokensOut: null,
      costUsd: null,
      attempts: null,
      dropped: null,
    });
    expect(done[0]!.fields.ms).toEqual(expect.any(Number));
  };

  it('a provider that never answers times out: ExternalServiceError, no save, reason timeout, signal aborted', async () => {
    const llm = new ScriptedLLM(() => new Promise(() => {}));
    const h = setup({ llm, callTimeoutMs: 20 });

    const err = await rejection(generate(h));
    expect(err).toBeInstanceOf(ExternalServiceError);
    expect((err as ExternalServiceError).statusCode).toBe(502);
    expect(h.store.saves).toEqual([]);
    failedLine(h, 'timeout');
    expect(structuredCalls(llm)[0]!.signal!.aborted).toBe(true);
  });

  it.each([
    ['a thrown provider error', () => new Error('provider exploded: PROVIDERSECRET'), 'model_failed'],
    ['an answer cut at the output limit', () => new OutputTruncatedError(BRIEF_SCHEMA_NAME, 2000, 'cut'), 'output_truncated'],
    ['an answer that fails the schema', () => new Error('answer does not match schema PrBriefDraft'), 'schema_invalid'],
  ])('%s: ExternalServiceError, no save, reason %s code', async (_name, makeError, reason) => {
    const llm = new ScriptedLLM(async () => {
      throw makeError();
    });
    const h = setup({ llm });

    const err = await rejection(generate(h));
    expect(err).toBeInstanceOf(ExternalServiceError);
    // The provider's message is not echoed to the caller or the log.
    expect((err as Error).message).toBe(`Brief generation failed (${reason})`);
    expect(h.store.saves).toEqual([]);
    failedLine(h, reason);
    expect(JSON.stringify(h.logs)).not.toContain('PROVIDERSECRET');
  });

  it('a draft with an empty summary is a schema mismatch from the real mock: 502 and no save', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { [BRIEF_SCHEMA_NAME]: { ...DRAFT, summary: '' } } });
    const h = setup({ llm });

    expect(await rejection(generate(h))).toBeInstanceOf(ExternalServiceError);
    expect(h.store.saves).toEqual([]);
    expect(line(h, DONE_LINE)).toHaveLength(1);
    expect(line(h, DONE_LINE)[0]!.fields).toMatchObject({ outcome: 'failed' });
  });

  it('a missing provider key gives 400 brief_unavailable naming the provider, before any GitHub call or model call (R-SRV-33)', async () => {
    const h = setup({ noKey: true, pull: { body: 'Closes #471.' } });

    const err = await rejection(generate(h));
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('brief_unavailable');
    expect((err as AppError).statusCode).toBe(400);
    expect((err as AppError).message).toContain('openai');
    expect(h.counters.githubResolved).toBe(0);
    expect(h.github.issueRequests).toEqual([]);
    expect(structuredCalls(h.llm)).toEqual([]);
    expect(h.store.saves).toEqual([]);
    expect(h.logs).toEqual([]);
  });

  it('an unknown pull request is 404 and a PR with no stored file is 422 with no model call (R-SRV-35, R-SRV-36)', async () => {
    const unknown = setup({ pull: null });
    expect(await rejection(generate(unknown))).toBeInstanceOf(NotFoundError);

    const noFiles = setup({ files: [] });
    const err = await rejection(generate(noFiles));
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).message).toBe("The PR's changed files are not loaded yet");
    expect(structuredCalls(noFiles.llm)).toEqual([]);
    expect(noFiles.counters.providersRequested).toEqual([]);
  });
});

// ------------------------------------------------------------------ concurrency

describe('BriefService.generate — one generation per PR in flight (R-SRV-37)', () => {
  /** A provider held until `release`/`fail`, with a promise that resolves once the call started. */
  function held() {
    let release!: () => void;
    let fail!: (e: Error) => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve, reject) => {
      release = resolve;
      fail = reject;
    });
    const calledP = new Promise<void>((resolve) => {
      started = resolve;
    });
    const llm = new ScriptedLLM(async () => {
      started();
      await gate;
      return okResult(DRAFT);
    });
    return { llm, release, fail, calledP };
  }

  it('a second generate while one runs makes no second model call and receives the same result', async () => {
    const { llm, release, calledP } = held();
    const h = setup({ llm });
    const second: Harness['logs'] = [];

    const first = generate(h);
    await calledP;
    const joined = h.service.generate(WS, PR, { info: (fields, message) => void second.push({ fields, message }) });
    release();
    const [a, b] = await Promise.all([first, joined]);

    expect(structuredCalls(llm)).toHaveLength(1);
    expect(b).toBe(a);
    expect(h.store.saves).toHaveLength(1);
    // The joiner writes no line of its own; the generation wrote one pair.
    expect(second).toEqual([]);
    expect(h.logs.map((l) => l.message)).toEqual([CALL_LINE, DONE_LINE]);
  });

  it('a second generate receives the same error when the generation fails, and a later one starts afresh', async () => {
    const { llm, fail, calledP } = held();
    const h = setup({ llm });

    const first = rejection(generate(h));
    await calledP;
    const joined = rejection(h.service.generate(WS, PR, h.log));
    fail(new Error('boom'));
    const [a, b] = await Promise.all([first, joined]);

    expect(a).toBeInstanceOf(ExternalServiceError);
    expect(b).toBe(a);
    expect(structuredCalls(llm)).toHaveLength(1);
    expect(h.store.saves).toEqual([]);

    // The in-flight entry is gone: the next POST is a new generation.
    await rejection(generate(h));
    expect(structuredCalls(llm)).toHaveLength(2);
  });
});

// ------------------------------------------------------------------ inputs

const inputOf = (record: Omit<PrBriefRecord, 'stale'>, kind: string) => record.inputs.find((i) => i.kind === kind);

describe('BriefService.generate — what each input is recorded as (R-SRV-12, R-SRV-13, R-SRV-28 to R-SRV-32)', () => {
  it('a stale intent is used with reason stale', async () => {
    const h = setup({ intent: { ...INTENT, stale: true } });
    await generate(h);
    const saved = h.store.saves[0]!;
    expect(inputOf(saved, 'intent')).toEqual({ kind: 'intent', status: 'used', reason: 'stale', omitted: null });
    expect(saved.intent).toEqual({ summary: INTENT.summary, in_scope: INTENT.in_scope, out_of_scope: INTENT.out_of_scope });
  });

  it('no stored intent still makes the call: intent is missing not_derived and stored as null', async () => {
    const h = setup({ intent: null });
    await generate(h);
    const saved = h.store.saves[0]!;
    expect(structuredCalls(h.llm)).toHaveLength(1);
    expect(inputOf(saved, 'intent')).toEqual({ kind: 'intent', status: 'missing', reason: 'not_derived', omitted: null });
    expect(saved.intent).toBeNull();
    expect(userText(structuredCalls(h.llm)[0]!)).not.toContain(INTENT_MARK);
  });

  it('a degraded map with symbols is used with the map reason and stored as sent', async () => {
    const h = setup({ blast: { ...BLAST, degraded: true, reason: 'index_partial' } });
    await generate(h);
    const saved = h.store.saves[0]!;
    expect(inputOf(saved, 'blast_radius')).toEqual({
      kind: 'blast_radius',
      status: 'used',
      reason: 'index_partial',
      omitted: null,
    });
    expect(saved.blast).toEqual({
      changed_symbols: BLAST.changed_symbols,
      downstream: BLAST.downstream,
      summary: BLAST.summary,
    });
  });

  it.each([
    ['an empty map with no reason', EMPTY_BLAST, 'no_data'],
    ['an empty map with the index reason', { ...EMPTY_BLAST, degraded: true, reason: 'index_failed' as const }, 'index_failed'],
    ['a blast read that throws', new Error('index down'), 'no_data'],
  ])('%s: the call is still made, blast_radius is missing %s and stored as null', async (_name, blast, reason) => {
    const h = setup({ blast });
    await generate(h);
    const saved = h.store.saves[0]!;
    expect(structuredCalls(h.llm)).toHaveLength(1);
    expect(inputOf(saved, 'blast_radius')).toEqual({ kind: 'blast_radius', status: 'missing', reason, omitted: null });
    expect(saved.blast).toBeNull();
  });

  it('an empty description is missing empty and absent from the prompt', async () => {
    const h = setup({ pull: { body: null } });
    await generate(h);
    expect(inputOf(h.store.saves[0]!, 'description')).toMatchObject({ status: 'missing', reason: 'empty' });
    expect(userText(structuredCalls(h.llm)[0]!)).not.toContain('<untrusted source="pr_description">');
  });

  it('reads the first #N once, on the pull request\'s own repository (R-SRV-31)', async () => {
    const h = setup({
      pull: { body: 'Closes #471, see also #12.' },
      github: { issues: { 471: { number: 471, title: 'Rate limit', body: ISSUE_MARK, state: 'open' } } },
    });
    await generate(h);

    expect(h.github.issueRequests).toEqual([471]);
    expect(h.github.repos).toEqual([{ owner: 'acme', name: 'api' }]);
    expect(inputOf(h.store.saves[0]!, 'linked_issue')).toEqual({
      kind: 'linked_issue',
      status: 'used',
      reason: null,
      omitted: null,
    });
    expect(userText(structuredCalls(h.llm)[0]!)).toContain(ISSUE_MARK);
  });

  it.each([
    ['no #N in the description', { pull: { body: 'No reference.' } }, 'none_linked'],
    ['no GitHub token', { pull: { body: 'Closes #471.' }, noToken: true }, 'no_token'],
    ['an issue that is not found', { pull: { body: 'Closes #471.' }, github: { issues: { 471: null } } }, 'not_found'],
    [
      'a read that fails',
      { pull: { body: 'Closes #471.' }, github: { issues: { 471: new Error('502') } } },
      'fetch_failed',
    ],
  ] satisfies [string, Setup, string][])('%s: linked_issue is missing %s and the brief goes on', async (_name, o, reason) => {
    const h = setup(o);
    const res = await generate(h);
    expect(res.brief).not.toBeNull();
    expect(inputOf(h.store.saves[0]!, 'linked_issue')).toEqual({
      kind: 'linked_issue',
      status: 'missing',
      reason,
      omitted: null,
    });
  });

  it.each([
    ['nothing attached', { attached: 0, notCloned: false, documents: [] }, 'missing', 'none_attached'],
    ['nothing attached wins over a missing clone', { attached: 0, notCloned: true, documents: [] }, 'missing', 'none_attached'],
    ['attached but the clone is missing', { attached: 2, notCloned: true, documents: [] }, 'missing', 'not_cloned'],
    ['every attached path skipped', { attached: 2, notCloned: false, documents: [] }, 'missing', 'all_skipped'],
    [
      'a document read',
      { attached: 1, notCloned: false, documents: [{ path: 'specs/a.md', text: 'spec' }] },
      'used',
      null,
    ],
  ] as const)('%s: spec_documents is %s %s', async (_name, documents, status, reason) => {
    const h = setup({ documents: { ...documents, documents: [...documents.documents] } });
    await generate(h);
    expect(inputOf(h.store.saves[0]!, 'spec_documents')).toMatchObject({ status, reason });
  });
});

// ------------------------------------------------------------------ the budget

describe('BriefService.generate — the budget (R-SRV-16 to R-SRV-18)', () => {
  const bigDoc = (name: string) => ({ path: `specs/${name}.md`, text: `${name} `.repeat(2000) });

  it('drops documents from the end until the prompt fits, and the counted prompt is the sent prompt, notes included', async () => {
    const h = setup({
      documents: { attached: 3, notCloned: false, documents: [bigDoc('first'), bigDoc('second'), bigDoc('third')] },
    });
    await generate(h);

    const [req] = structuredCalls(h.llm);
    const prompt = sentText(req!);
    const saved = h.store.saves[0]!;
    expect(inputOf(saved, 'spec_documents')).toEqual({
      kind: 'spec_documents',
      status: 'trimmed',
      reason: 'over_budget',
      omitted: 1,
    });
    expect(prompt).toContain('specs/first.md');
    expect(prompt).toContain('specs/second.md');
    expect(prompt).not.toContain('specs/third.md');
    // The model is told what was cut, and that note is part of what was counted.
    expect(prompt).toContain('- spec_documents: trimmed (over_budget), 1 left out');
    expect(saved.input_tokens).toBe(count(prompt));
    expect(saved.input_tokens).toBeLessThanOrEqual(INPUT_BUDGET_TOKENS);
    expect(line(h, CALL_LINE)[0]!.fields.inputTokens).toBe(saved.input_tokens);
    expect(line(h, CALL_LINE)[0]!.fields.inputs).toMatchObject({ spec_documents: 'trimmed' });
  });

  it('when even dropping every file does not fit, the call still runs: diff_stats trimmed with the files left out, validation uses the full file list', async () => {
    // The title is never cut, so the prompt cannot fit.
    const h = setup({ pull: { title: 'x'.repeat(40_000) } });
    const res = await generate(h);

    expect(structuredCalls(h.llm)).toHaveLength(1);
    const saved = h.store.saves[0]!;
    expect(inputOf(saved, 'diff_stats')).toEqual({
      kind: 'diff_stats',
      status: 'trimmed',
      reason: 'over_budget',
      omitted: FILES.length,
    });
    expect(userText(structuredCalls(h.llm)[0]!)).not.toContain('src/limiter.ts (');
    // `src/limiter.ts` is no longer in the prompt but is still a changed file of the PR.
    expect(res.brief!.review_focus).toEqual([{ file: 'src/limiter.ts', line: 5, reason: 'entry point' }]);
    // The ghost focus item is dropped; the files left out of the prompt do not count as unknown.
    expect(res.brief!.dropped.review_focus).toBe(1);
  });

  describe('risk references are validated against the full blast map, not the map as sent (R-SRV-6, EC-12)', () => {
    const FAR_FILE = 'src/far/caller.ts';
    // Three callers, the last in a file the PR does not change.
    const FAR_BLAST: BlastRadiusResponse = {
      ...BLAST,
      downstream: [
        {
          symbol: 'rateLimit',
          callers: [
            { name: 'boot', file: 'src/server.ts', line: 88 },
            { name: 'wrap', file: 'src/mid/wrap.ts', line: 3 },
            { name: 'faraway', file: FAR_FILE, line: 7 },
          ],
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
      totals: { symbols: 1, callers: 3, endpoints: 0, crons: 0, symbols_without_callers: 0 },
    };
    // Over the budget exactly while the far caller line is in the text: dropping that caller fits.
    const overWhileFarCallerIsIn = {
      count: (text: string) => (text.includes(FAR_FILE) ? INPUT_BUDGET_TOKENS + 1000 : 100),
    };
    const draftOf = (file_refs: string[]) => ({
      summary: `A rate limiter guards the API. ${MODEL_MARK}`,
      risks: [{ kind: 'breaking_api', title: 'Far caller', explanation: 'It calls the limiter.', severity: 'medium', file_refs }],
      review_focus: [],
    });
    const farSetup = (file_refs: string[]) =>
      setup({
        blast: FAR_BLAST,
        tokenizer: overWhileFarCallerIsIn,
        llm: new MockLLMProvider('openai', { structuredBySchema: { [BRIEF_SCHEMA_NAME]: draftOf(file_refs) } }),
      });

    it('keeps a risk whose only reference is a caller the budget cut from the prompt; the stored blast still omits that caller', async () => {
      const h = farSetup([`${FAR_FILE}:7`]);
      const res = await generate(h);

      expect(sentText(structuredCalls(h.llm)[0]!)).not.toContain(FAR_FILE);
      const saved = h.store.saves[0]!;
      expect(saved.risks.risks).toHaveLength(1);
      expect(saved.risks.risks[0]!.file_refs).toEqual([`${FAR_FILE}:7`]);
      expect(res.brief!.dropped.risks).toBe(0);
      expect(saved.dropped.risks).toBe(0);
      expect(inputOf(saved, 'blast_radius')).toMatchObject({ status: 'trimmed', reason: 'over_budget' });
      expect(inputOf(saved, 'blast_radius')!.omitted).toBeGreaterThanOrEqual(1);
      const storedCallers = saved.blast!.downstream.flatMap((d) => d.callers);
      expect(storedCallers.map((c) => c.file)).toEqual(['src/server.ts', 'src/mid/wrap.ts']);
      expect(storedCallers.some((c) => c.file === FAR_FILE)).toBe(false);
    });

    it('still drops a risk whose only reference is in neither the PR nor the map', async () => {
      const h = farSetup(['src/ghost.ts:4']);
      const res = await generate(h);

      expect(res.brief!.risks.risks).toEqual([]);
      expect(res.brief!.dropped.risks).toBe(1);
      expect(h.store.saves[0]!.dropped.risks).toBe(1);
    });
  });

  it('sums the stored files for the totals when the PR row has no stats yet (all three zero)', async () => {
    const h = setup({ pull: { additions: 0, deletions: 0, filesCount: 0 } });
    await generate(h);
    expect(userText(structuredCalls(h.llm)[0]!)).toContain('totals: 2 files, +33 -3');
  });

  it("uses the PR row's own totals when stats are filled in", async () => {
    const h = setup({ pull: { additions: 247, deletions: 38, filesCount: 9 } });
    await generate(h);
    expect(userText(structuredCalls(h.llm)[0]!)).toContain('totals: 9 files, +247 -38');
  });
});

// ------------------------------------------------------------------ get

describe('BriefService.get — the stored brief with stale computed on read (R-SRV-3 to R-SRV-5, R-SRV-36, R-SRV-39)', () => {
  async function stored(h: Harness) {
    await generate(h);
    h.logs.length = 0;
    const calls = h.llm.calls.length;
    return calls;
  }

  it('answers { brief: null } when nothing is stored', async () => {
    const h = setup();
    expect(await h.service.get(WS, PR, h.log)).toEqual({ brief: null });
  });

  it('answers the stored brief, not stale, and makes no model call and no GitHub call', async () => {
    const h = setup({ pull: { body: 'Closes #471.' } });
    const callsBefore = await stored(h);
    const githubBefore = h.counters.githubResolved;
    const issuesBefore = h.github.issueRequests.length;

    const res = await h.service.get(WS, PR, h.log);
    expect(res.brief).toEqual({ ...h.store.saves[0]!, stale: false });
    expect(h.llm.calls).toHaveLength(callsBefore);
    expect(h.counters.githubResolved).toBe(githubBefore);
    expect(h.github.issueRequests).toHaveLength(issuesBefore);
  });

  it('is stale exactly when the stored head SHA differs from the PR current head SHA', async () => {
    const h = setup();
    await stored(h);
    h.store.pull = pullOf({ headSha: 'ffffffffffff' });
    expect((await h.service.get(WS, PR, h.log)).brief!.stale).toBe(true);
    h.store.pull = pullOf({ headSha: HEAD });
    expect((await h.service.get(WS, PR, h.log)).brief!.stale).toBe(false);
  });

  it('an unreadable row answers { brief: null } with one info line holding the PR id and nothing else of the PR', async () => {
    const h = setup();
    h.store.unreadable = true;

    expect(await h.service.get(WS, PR, h.log)).toEqual({ brief: null });
    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]!.fields).toEqual({ prId: PR });
  });

  it('answers 404 for a PR outside the workspace', async () => {
    const h = setup();
    expect(await rejection(h.service.get('other-ws', PR, h.log))).toBeInstanceOf(NotFoundError);
    expect(h.store.reads).toBe(0);
  });
});
