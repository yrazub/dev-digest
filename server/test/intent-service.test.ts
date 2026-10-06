/**
 * `IntentService` (`modules/intent/service.ts`) with fake ports: an in-memory `IntentStore`
 * written here, `MockLLMProvider` answering by schema name, `MockGitHubClient` and a
 * counting tokenizer. Hermetic: no database, no network, no key.
 * Spec: `server/specs/L03-intent-layer.md`; plan: `specs/L03-intent-layer-plan.md` (phases 5 and 10).
 */
import { describe, it, expect, vi } from 'vitest';
import type {
  FeatureModelChoice,
  IntentSource,
  RunEventKind,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { OutputTruncatedError } from '@devdigest/reviewer-core';
import { MockGitHubClient, MockLLMProvider, type MockGitHubOptions } from '../src/adapters/mocks.js';
import { AppError, ConfigError, ExternalServiceError, NotFoundError } from '../src/platform/errors.js';
import { TimeoutError } from '../src/platform/resilience.js';
import { IntentClassification, sourceHash } from '../src/modules/intent/domain.js';
import type {
  IntentPullContext,
  IntentReadOptions,
  IntentStore,
  IntentValues,
  StoredIntent,
} from '../src/modules/intent/ports.js';
import { IntentService, type IntentEventSink } from '../src/modules/intent/service.js';

// ------------------------------------------------------------------ fixtures

const HEAD = 'a1b2c3d4e5';
const BASE = 'main';
const DEFAULT_PROVIDER = 'openrouter';
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';
const MODEL_NAME = `${DEFAULT_PROVIDER}/${DEFAULT_MODEL}`;
const DOC_PATH = 'specs/rate-limit.md';

/** More than 80 characters, with no reference of any kind in it. */
const PLAIN_BODY =
  'Adds a token-bucket limiter to the public API and returns 429 with Retry-After when a client exceeds its quota.';

const HUNK_HEADER = '@@ -10,3 +10,4 @@ export function rateLimit(opts) {';
const PATCH = [HUNK_HEADER, '   const keepLine = 1;', '+  const addedLine = "sk_live_xxx";', '-  const removedLine = 2;'].join(
  '\n',
);

const CLASSIFICATION: IntentClassification = {
  summary: 'Adds a token-bucket rate limiter to the public API.',
  in_scope: ['Token-bucket limiter', 'Return 429 with Retry-After'],
  out_of_scope: ['Per-user limits'],
  risk_areas: [{ kind: 'api', label: 'Public API behaviour changes' }],
  basis: 'stated',
  injection_suspected: false,
};

const ISSUE_471 = { number: 471, title: 'Rate limit the API', body: 'Public endpoints are unbounded.', state: 'open' };

function pullContext(pull: Partial<IntentPullContext['pull']> = {}): IntentPullContext {
  return {
    pull: {
      id: 'pr-1',
      number: 482,
      title: 'Add rate limiting',
      body: PLAIN_BODY,
      branch: 'feat/rl',
      base: BASE,
      headSha: HEAD,
      ...pull,
    },
    repo: { owner: 'acme', name: 'api' },
    files: [{ path: 'src/limiter.ts', additions: 40, deletions: 2, patch: PATCH }],
  };
}

/** An in-memory `IntentStore`. `upserts` records every write; `unreadable` makes the stored row fail its read. */
class MemoryStore implements IntentStore {
  row: StoredIntent | undefined;
  override: FeatureModelChoice | undefined;
  unreadable: string[] | undefined;
  upserts: IntentValues[] = [];
  contextCalls: { includeFiles: boolean }[] = [];

  constructor(public ctx: IntentPullContext | undefined) {}

  async getPullContext(_workspaceId: string, prId: string, opts: { includeFiles?: boolean } = {}) {
    this.contextCalls.push({ includeFiles: opts.includeFiles === true });
    if (!this.ctx || this.ctx.pull.id !== prId) return undefined;
    return { ...this.ctx, files: opts.includeFiles ? this.ctx.files : [] };
  }

  async getIntent(prId: string, opts: IntentReadOptions = {}): Promise<StoredIntent | undefined> {
    if (this.unreadable) {
      opts.onUnreadable?.({ prId, columns: this.unreadable });
      return undefined;
    }
    return this.row;
  }

  async upsertIntent(prId: string, values: IntentValues): Promise<StoredIntent> {
    this.upserts.push(values);
    this.row = { prId, ...values, computedAt: new Date('2026-10-05T10:00:00.000Z') };
    return this.row;
  }

  async featureModelOverride() {
    return this.override;
  }
}

/** A provider whose structured call always rejects with `err`. */
class FailingLLM extends MockLLMProvider {
  constructor(private readonly failure: Error) {
    super('openrouter');
  }
  override async completeStructured<T>(_req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    throw this.failure;
  }
}

interface Setup {
  pull?: Partial<IntentPullContext['pull']>;
  github?: MockGitHubOptions;
  fixture?: unknown;
  /** The lazy provider throws `ConfigError`, as with no API key. */
  noKey?: boolean;
  /** The lazy GitHub client throws `ConfigError`, as with no token. */
  noToken?: boolean;
  llm?: MockLLMProvider;
}

interface Event {
  kind: RunEventKind;
  msg: string;
  data?: unknown;
}

function setup(o: Setup = {}) {
  const store = new MemoryStore(pullContext(o.pull));
  const github = new MockGitHubClient(o.github);
  const llm =
    o.llm ??
    new MockLLMProvider('openrouter', { structuredBySchema: { IntentClassification: o.fixture ?? CLASSIFICATION } });
  const counted: string[] = [];
  const tokenizer = {
    count(text: string) {
      counted.push(text);
      return 1234;
    },
  };
  const counters = { githubResolved: 0, providersRequested: [] as string[] };
  const service = new IntentService({
    store,
    tokenizer,
    github: async () => {
      counters.githubResolved += 1;
      if (o.noToken) throw new ConfigError('GITHUB_TOKEN is not configured');
      return github;
    },
    llm: async (p) => {
      counters.providersRequested.push(p);
      if (o.noKey) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return llm;
    },
  });
  const events: Event[] = [];
  const onEvent: IntentEventSink = (kind, msg, data) => {
    events.push({ kind, msg, data });
  };
  return { service, store, github, llm, counted, counters, events, onEvent };
}

type Harness = ReturnType<typeof setup>;

const ensure = (h: Harness) => h.service.ensure('ws', 'pr-1', { onEvent: h.onEvent });

/** The classifier's calls, with their messages split by role. */
function classifierCalls(llm: MockLLMProvider) {
  return llm.calls
    .filter((c) => c.method === 'completeStructured')
    .map((c) => {
      const req = c.req as StructuredRequest<unknown>;
      return {
        req,
        system: req.messages.find((m) => m.role === 'system')?.content ?? '',
        user: req.messages.find((m) => m.role === 'user')?.content ?? '',
      };
    });
}

const sourceOf = (source: IntentSource[], kind: IntentSource['kind'], ref: string | null = null) =>
  source.find((s) => s.kind === kind && s.ref === ref);

/** `Intent:` lines hold no `error` event, whatever happened. */
const kinds = (events: Event[]) => events.map((e) => e.kind as string);

// ------------------------------------------------------------------ confidence and sources

describe('IntentService.ensure — what is read and how confident it is', () => {
  it('reads an issue and a document: both used, confidence high', async () => {
    const h = setup({
      pull: { body: `Adds a limiter. Closes #471. Design in ${DOC_PATH}.` },
      github: {
        issues: { 471: ISSUE_471 },
        files: { [`${HEAD}:${DOC_PATH}`]: 'The limiter allows 100 requests a minute.' },
      },
    });
    const res = await ensure(h);

    expect(res.outcome).toBe('computed');
    expect(res.record?.confidence).toBe('high');
    expect(res.record?.missing_context).toBe(false);
    expect(sourceOf(res.record!.sources, 'linked_issue', '#471')).toMatchObject({ status: 'used', reason: null });
    expect(sourceOf(res.record!.sources, 'spec_document', DOC_PATH)).toMatchObject({ status: 'used', reason: null });
    const [call] = classifierCalls(h.llm);
    expect(call!.user).toContain('<untrusted source="issue-471">');
    expect(call!.user).toContain('The limiter allows 100 requests a minute.');
  });

  it('a description alone gives medium, with title, description and changed files as sources', async () => {
    const h = setup();
    const res = await ensure(h);

    expect(res.record?.confidence).toBe('medium');
    expect(res.record?.sources.map((s) => s.kind)).toEqual(['title', 'description', 'changed_files']);
    expect(res.record?.summary).toBe(CLASSIFICATION.summary);
    expect(res.record?.stale).toBe(false);
    expect(h.store.upserts).toHaveLength(1);
  });

  it('an empty description gives low and sources title and changed files; the prompt has no description block (R7)', async () => {
    const h = setup({ pull: { body: '' } });
    const res = await ensure(h);

    expect(res.record?.confidence).toBe('low');
    expect(res.record?.sources.map((s) => s.kind)).toEqual(['title', 'changed_files']);
    const [call] = classifierCalls(h.llm);
    expect(call!.user).not.toContain('pr-description');
    expect(call!.user).toContain('<untrusted source="pr-title">');
    expect(call!.user).toContain('<untrusted source="changed-files">');
    expect(call!.user).toContain('src/limiter.ts');
  });

  it('sends hunk headers only: no patch body line, and the PR is not fetched for commit messages (R1)', async () => {
    const h = setup();
    const getPullRequest = vi.spyOn(h.github, 'getPullRequest');
    await ensure(h);

    const [call] = classifierCalls(h.llm);
    const all = `${call!.system}\n${call!.user}`;
    expect(all).toContain(HUNK_HEADER);
    expect(all).not.toContain('keepLine');
    expect(all).not.toContain('addedLine');
    expect(all).not.toContain('removedLine');
    expect(getPullRequest).not.toHaveBeenCalled();
  });

  it('reads the files only on a computation, never on a plain read', async () => {
    const h = setup();
    await h.service.get('ws', 'pr-1');
    expect(h.store.contextCalls).toEqual([{ includeFiles: false }]);
    await ensure(h);
    expect(h.store.contextCalls.at(-1)).toEqual({ includeFiles: true });
  });

  it('a sanitised description hides a reference inside an HTML comment from the reader', async () => {
    const h = setup({ pull: { body: `${PLAIN_BODY}\n<!-- Closes #999 -->` } });
    const res = await ensure(h);

    expect(h.github.issueRequests).toEqual([]);
    expect(res.record?.sources.some((s) => s.kind === 'linked_issue')).toBe(false);
    expect(h.events.map((e) => e.msg)).toContain('Intent sanitiser: 1 HTML comment(s), 0 invisible char(s) removed');
  });

  it('a Jira URL and another repository issue are recorded as unsupported and never requested', async () => {
    const h = setup({
      pull: { body: 'Tracked in https://acme.atlassian.net/browse/PAY-123 and other/repo#5, see the thread.' },
    });
    const res = await ensure(h);

    expect(sourceOf(res.record!.sources, 'linked_issue', 'https://acme.atlassian.net/browse/PAY-123')).toMatchObject({
      status: 'unavailable',
      reason: 'unsupported',
    });
    expect(sourceOf(res.record!.sources, 'linked_issue', 'other/repo#5')).toMatchObject({
      status: 'unavailable',
      reason: 'unsupported',
    });
    expect(res.record?.missing_context).toBe(true);
    expect(h.github.issueRequests).toEqual([]);
    expect(h.github.fileRequests).toEqual([]);
    expect(h.counters.githubResolved).toBe(0);
  });

  it('a document path with a ".." segment is rejected and never requested', async () => {
    const h = setup({ pull: { body: `${PLAIN_BODY} See [the plan](../secrets/plan.md).` } });
    const res = await ensure(h);

    expect(sourceOf(res.record!.sources, 'spec_document', '../secrets/plan.md')).toMatchObject({
      status: 'unavailable',
      reason: 'rejected',
    });
    expect(h.github.fileRequests).toEqual([]);
    expect(h.counters.githubResolved).toBe(0);
  });

  it('without a GitHub token the same-repository references are unavailable / no_token', async () => {
    const h = setup({ noToken: true, pull: { body: `${PLAIN_BODY} Closes #471. Plan in ${DOC_PATH}.` } });
    const res = await ensure(h);

    expect(res.outcome).toBe('computed');
    expect(sourceOf(res.record!.sources, 'linked_issue', '#471')).toMatchObject({
      status: 'unavailable',
      reason: 'no_token',
    });
    expect(sourceOf(res.record!.sources, 'spec_document', DOC_PATH)).toMatchObject({
      status: 'unavailable',
      reason: 'no_token',
    });
    expect(res.record?.missing_context).toBe(true);
    expect(h.github.issueRequests).toEqual([]);
    expect(h.github.fileRequests).toEqual([]);
  });

  it('a suspected injection forces low even when an issue was read', async () => {
    const h = setup({
      pull: { body: `${PLAIN_BODY} Closes #471.` },
      github: { issues: { 471: ISSUE_471 } },
      fixture: { ...CLASSIFICATION, basis: 'stated', injection_suspected: true },
    });
    const res = await ensure(h);

    expect(res.record?.confidence).toBe('low');
    expect(res.record?.injection_suspected).toBe(true);
  });

  const OVERRULED =
    'Intent: the classifier reported its basis as insufficient, but a linked issue or specification was read — not applied';

  it('does not let "basis insufficient" lower the tier when a linked issue was read, and says so', async () => {
    const h = setup({
      pull: { body: `${PLAIN_BODY} Closes #471.` },
      github: { issues: { 471: ISSUE_471 } },
      fixture: { ...CLASSIFICATION, basis: 'insufficient', injection_suspected: false },
    });
    const res = await ensure(h);

    expect(res.record?.confidence).toBe('high');
    const line = h.events.find((e) => e.msg === OVERRULED);
    expect(line?.kind).toBe('info');
    expect(h.events.map((e) => e.msg)).not.toContain('Intent: basis insufficient — forced to low');
  });

  it('"basis insufficient" still forces low when nothing but the description was read', async () => {
    const h = setup({ fixture: { ...CLASSIFICATION, basis: 'insufficient', injection_suspected: false } });
    const res = await ensure(h);

    expect(res.record?.confidence).toBe('low');
    expect(h.events.map((e) => e.msg)).toContain('Intent: basis insufficient — forced to low');
    expect(h.events.map((e) => e.msg)).not.toContain(OVERRULED);
  });
});

// ------------------------------------------------------------------ documents and the base fallback

describe('IntentService.ensure — document reads (R8)', () => {
  const bodyWithDoc = `${PLAIN_BODY} Closes #471. Plan in ${DOC_PATH}.`;

  it('requests the document at the head SHA and stops there when it is found', async () => {
    const h = setup({
      pull: { body: bodyWithDoc },
      github: { files: { [`${HEAD}:${DOC_PATH}`]: 'doc' } },
    });
    await ensure(h);
    expect(h.github.fileRequests).toEqual([`${HEAD}:${DOC_PATH}`]);
  });

  it('reads the document once more at the base only when the head answers not_found', async () => {
    const h = setup({
      pull: { body: bodyWithDoc },
      github: { files: { [`${BASE}:${DOC_PATH}`]: 'base copy of the plan' } },
    });
    const res = await ensure(h);

    expect(h.github.fileRequests).toEqual([`${HEAD}:${DOC_PATH}`, `${BASE}:${DOC_PATH}`]);
    expect(sourceOf(res.record!.sources, 'spec_document', DOC_PATH)).toMatchObject({ status: 'used', reason: null });
    expect(classifierCalls(h.llm)[0]!.user).toContain('base copy of the plan');
  });

  it('a document missing at both refs is unavailable / not_found, lowers confidence one tier and is listed for the model', async () => {
    const h = setup({ pull: { body: bodyWithDoc }, github: { issues: { 471: ISSUE_471 } } });
    const res = await ensure(h);

    expect(h.github.fileRequests).toEqual([`${HEAD}:${DOC_PATH}`, `${BASE}:${DOC_PATH}`]);
    expect(sourceOf(res.record!.sources, 'spec_document', DOC_PATH)).toMatchObject({
      status: 'unavailable',
      reason: 'not_found',
    });
    expect(res.record?.missing_context).toBe(true);
    // The issue was read (base tier high); the missing document lowers it by one tier.
    expect(res.record?.confidence).toBe('medium');

    const [call] = classifierCalls(h.llm);
    const block = /<untrusted source="unavailable-references">\n([\s\S]*?)\n<\/untrusted>/.exec(call!.user)?.[1];
    expect(block).toContain(DOC_PATH);
    expect(block).toContain('not_found');
    expect(call!.system).toMatch(/do not guess/i);
  });

  it.each([
    ['too_large', 'too_large'],
    ['not_a_file', 'unsupported'],
    ['empty', 'not_found'],
  ] as const)('a head read ending %s is recorded as %s and is not retried at the base', async (miss, recorded) => {
    const h = setup({
      pull: { body: bodyWithDoc },
      github: { issues: { 471: ISSUE_471 }, fileMisses: { [`${HEAD}:${DOC_PATH}`]: miss } },
    });
    const res = await ensure(h);

    expect(sourceOf(res.record!.sources, 'spec_document', DOC_PATH)).toMatchObject({
      status: 'unavailable',
      reason: recorded,
    });
    expect(res.record?.missing_context).toBe(true);
    expect(h.github.fileRequests).toEqual([`${HEAD}:${DOC_PATH}`]);
  });

  it('a document read that throws an ExternalServiceError is fetch_failed, with no base request', async () => {
    const h = setup({
      pull: { body: bodyWithDoc },
      github: {
        issues: { 471: ISSUE_471 },
        fileMisses: { [`${HEAD}:${DOC_PATH}`]: new ExternalServiceError('GitHub getFileContent failed (403)') },
      },
    });
    const res = await ensure(h);

    expect(res.outcome).toBe('computed');
    expect(sourceOf(res.record!.sources, 'spec_document', DOC_PATH)).toMatchObject({
      status: 'unavailable',
      reason: 'fetch_failed',
    });
    expect(h.github.fileRequests).toEqual([`${HEAD}:${DOC_PATH}`]);
  });

  it('an issue that does not exist (null) is unavailable / not_found', async () => {
    const h = setup({ pull: { body: `${PLAIN_BODY} Closes #471.` }, github: { issues: { 471: null } } });
    const res = await ensure(h);

    expect(sourceOf(res.record!.sources, 'linked_issue', '#471')).toMatchObject({
      status: 'unavailable',
      reason: 'not_found',
    });
    expect(res.record?.missing_context).toBe(true);
  });

  it('an issue read that throws an ExternalServiceError is fetch_failed', async () => {
    const h = setup({
      pull: { body: `${PLAIN_BODY} Closes #471.` },
      github: { issues: { 471: new ExternalServiceError('GitHub getIssue failed (403)') } },
    });
    const res = await ensure(h);

    expect(res.outcome).toBe('computed');
    expect(sourceOf(res.record!.sources, 'linked_issue', '#471')).toMatchObject({
      status: 'unavailable',
      reason: 'fetch_failed',
    });
  });
});

// ------------------------------------------------------------------ cache and force

describe('IntentService — cache, staleness and force', () => {
  it('an equal hash is cached: no second model call, the stored call stats come back', async () => {
    const h = setup();
    const first = await ensure(h);
    expect(first.outcome).toBe('computed');

    const second = await ensure(h);
    expect(second.outcome).toBe('cached');
    expect(second.record).toMatchObject({ summary: CLASSIFICATION.summary, stale: false });
    expect(second.call).toMatchObject({
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
    });
    expect(classifierCalls(h.llm)).toHaveLength(1);
    expect(h.store.upserts).toHaveLength(1);
    expect(h.events.map((e) => e.msg)).toContain(
      `Intent: cached (medium confidence, head ${HEAD.slice(0, 7)}) — classifier not called`,
    );
  });

  it.each([
    ['title', (h: Harness) => void (h.store.ctx!.pull.title = 'Add rate limiting v2')],
    ['body', (h: Harness) => void (h.store.ctx!.pull.body = `${PLAIN_BODY} Also adds metrics.`)],
    ['head SHA', (h: Harness) => void (h.store.ctx!.pull.headSha = 'ffffffffff')],
    [
      'model',
      (h: Harness) => void (h.store.override = { provider: 'openrouter', model: 'z-ai/glm-4.7-flash' }),
    ],
  ])('a changed %s recomputes', async (_name, change) => {
    const h = setup();
    await ensure(h);
    change(h);

    const again = await ensure(h);
    expect(again.outcome).toBe('computed');
    expect(classifierCalls(h.llm)).toHaveLength(2);
  });

  it('a recompute after a model change calls the new model', async () => {
    const h = setup();
    h.store.override = { provider: 'openrouter', model: 'z-ai/glm-4.7-flash' };
    await ensure(h);
    expect(classifierCalls(h.llm)[0]!.req.model).toBe('z-ai/glm-4.7-flash');
  });

  it('regenerate ignores a matching hash and recomputes', async () => {
    const h = setup();
    await ensure(h);
    const record = await h.service.regenerate('ws', 'pr-1', { onEvent: h.onEvent });

    expect(record.summary).toBe(CLASSIFICATION.summary);
    expect(classifierCalls(h.llm)).toHaveLength(2);
    expect(h.store.upserts).toHaveLength(2);
  });

  it('a stored row with a null hash reads fresh on get, while ensure recomputes it', async () => {
    const h = setup();
    await ensure(h);
    h.store.row = { ...h.store.row!, sourceHash: null, model: 'seed' };

    expect((await h.service.get('ws', 'pr-1'))?.stale).toBe(false);
    const res = await ensure(h);
    expect(res.outcome).toBe('computed');
    expect(classifierCalls(h.llm)).toHaveLength(2);
  });

  it('get computes stale on read and never calls the model or GitHub', async () => {
    const h = setup();
    await ensure(h);
    const callsAfterEnsure = classifierCalls(h.llm).length;
    expect((await h.service.get('ws', 'pr-1'))?.stale).toBe(false);

    h.store.ctx!.pull.title = 'A different title';
    const stale = await h.service.get('ws', 'pr-1');
    expect(stale?.stale).toBe(true);
    expect(stale?.summary).toBe(CLASSIFICATION.summary);
    expect(classifierCalls(h.llm)).toHaveLength(callsAfterEnsure);
  });

  it('get returns null before any derivation and throws a not-found error for an unknown PR', async () => {
    const h = setup();
    expect(await h.service.get('ws', 'pr-1')).toBeNull();
    await expect(h.service.get('ws', 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a stored hash of the current inputs is what a computation writes', async () => {
    const h = setup();
    await ensure(h);
    expect(h.store.upserts[0]!.sourceHash).toBe(
      sourceHash({
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        headSha: HEAD,
        title: 'Add rate limiting',
        body: PLAIN_BODY,
      }),
    );
  });
});

// ------------------------------------------------------------------ failures

describe('IntentService — failures', () => {
  it('a missing provider key: ensure is unavailable / no_api_key, nothing is stored, GitHub is not asked', async () => {
    const h = setup({ noKey: true, pull: { body: `${PLAIN_BODY} Closes #471. Plan in ${DOC_PATH}.` } });
    const res = await ensure(h);

    expect(res).toMatchObject({ record: null, outcome: 'unavailable', reason: 'no_api_key' });
    expect(h.store.upserts).toHaveLength(0);
    expect(h.counters.githubResolved).toBe(0);
    expect(h.github.issueRequests).toEqual([]);
    expect(h.github.fileRequests).toEqual([]);
    expect(h.events.map((e) => e.msg)).toContain('Intent unavailable (no_api_key) — continuing without it');
    expect(kinds(h.events)).not.toContain('error');
  });

  it('a missing provider key: regenerate throws intent_unavailable with status 400', async () => {
    const h = setup({ noKey: true });
    const err = await h.service.regenerate('ws', 'pr-1').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'intent_unavailable', statusCode: 400 });
    expect(h.store.upserts).toHaveLength(0);
  });

  it('an answer cut off at the output limit is unavailable / output_truncated, and nothing is stored', async () => {
    const llm = new MockLLMProvider('openrouter', { structuredBySchema: { IntentClassification: CLASSIFICATION } });
    llm.completeStructured = (async () => {
      throw new OutputTruncatedError('IntentClassification', 2000);
    }) as typeof llm.completeStructured;
    const h = setup({ llm });
    const res = await ensure(h);
    expect(res).toMatchObject({ record: null, outcome: 'unavailable', reason: 'output_truncated' });
    expect(h.store.upserts).toHaveLength(0);
    expect(h.events.map((e) => e.msg)).toContain('Intent unavailable (output_truncated) — continuing without it');
    expect(kinds(h.events)).not.toContain('error');
  });

  it('an answer with an empty summary is not stored as an intent', async () => {
    const h = setup({ fixture: { ...CLASSIFICATION, summary: '   ', in_scope: [], out_of_scope: [], risk_areas: [] } });
    const res = await ensure(h);
    expect(res).toMatchObject({ record: null, outcome: 'unavailable', reason: 'schema_invalid' });
    expect(h.store.upserts).toHaveLength(0);
  });

  it('a fixture that fails the schema is unavailable / schema_invalid and nothing is stored', async () => {
    const h = setup({ fixture: { summary: 42 } });
    const res = await ensure(h);

    expect(res).toMatchObject({ record: null, outcome: 'unavailable', reason: 'schema_invalid' });
    expect(h.store.upserts).toHaveLength(0);
    expect(kinds(h.events)).not.toContain('error');
  });

  it('any other model failure is model_failed; a timeout is timeout', async () => {
    const failed = setup({ llm: new FailingLLM(new Error('upstream exploded')) });
    expect(await ensure(failed)).toMatchObject({ outcome: 'unavailable', reason: 'model_failed' });

    const slow = setup({ llm: new FailingLLM(new TimeoutError(30_000)) });
    expect(await ensure(slow)).toMatchObject({ outcome: 'unavailable', reason: 'timeout' });
    expect(slow.store.upserts).toHaveLength(0);
  });

  it('regenerate maps a model failure to an ExternalServiceError', async () => {
    const h = setup({ llm: new FailingLLM(new Error('upstream exploded')) });
    await expect(h.service.regenerate('ws', 'pr-1')).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it('an unknown pull request: ensure is unavailable / pull_not_found, regenerate throws not found', async () => {
    const h = setup();
    expect(await h.service.ensure('ws', 'missing')).toMatchObject({ outcome: 'unavailable', reason: 'pull_not_found' });
    await expect(h.service.regenerate('ws', 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ------------------------------------------------------------------ events (R6)

describe('IntentService — events', () => {
  const SECRETS = {
    description: 'DESC-MARKER-7c1',
    issueBody: 'ISSUE-BODY-MARKER-9d2',
    documentBody: 'DOC-BODY-MARKER-4e8',
    hunkHeader: 'leakyHunkContext',
  };

  it('emits the components line, the estimate line before the call and the done line after it, naming the model', async () => {
    const h = setup();
    await ensure(h);
    const msgs = h.events.map((e) => e.msg);

    const components = msgs.findIndex((m) => m.startsWith('Intent prompt components:'));
    const estimate = msgs.findIndex((m) => m.startsWith('Intent classifier call →'));
    const done = msgs.findIndex((m) => m.startsWith('Intent classifier done ←'));
    expect(components).toBeGreaterThanOrEqual(0);
    expect(estimate).toBeGreaterThan(components);
    expect(done).toBeGreaterThan(estimate);

    expect(msgs[estimate]).toContain(MODEL_NAME);
    expect(msgs[estimate]).toContain('~1234 tok estimated');
    expect(msgs[done]).toContain(MODEL_NAME);
    expect(msgs[done]).toContain('100 in / 50 out tok');
    expect(h.events[estimate]!.kind).toBe('tool');
    expect(h.events[done]!.kind).toBe('result');
    expect(msgs).toContain('Intent derived: medium confidence · 2 in scope · 1 out of scope · 1 risk area(s)');

    // The estimate is the tokenizer's count of the messages the model receives.
    expect(h.counted).toHaveLength(1);
    expect(h.counted[0]).toContain(classifierCalls(h.llm)[0]!.user);
  });

  it('emits no event of kind error and does not emit the route-owned "Deriving PR intent…" line', async () => {
    const h = setup();
    await ensure(h);
    await h.service.regenerate('ws', 'pr-1', { onEvent: h.onEvent });

    expect(kinds(h.events)).not.toContain('error');
    expect(h.events.map((e) => e.msg)).not.toContain('Deriving PR intent…');
  });

  it('carries no description text, issue or document body, or hunk header in any message or data (R6)', async () => {
    const h = setup({
      pull: { body: `${SECRETS.description} Closes #471. Plan in ${DOC_PATH}.` },
      github: {
        issues: { 471: { ...ISSUE_471, body: SECRETS.issueBody } },
        files: { [`${HEAD}:${DOC_PATH}`]: SECRETS.documentBody },
      },
    });
    h.store.ctx!.files = [
      {
        path: 'src/limiter.ts',
        additions: 1,
        deletions: 0,
        patch: `@@ -1,2 +1,3 @@ ${SECRETS.hunkHeader}\n+added`,
      },
    ];
    await ensure(h);

    // The sources really reached the model, so the absence below is not an empty run.
    const user = classifierCalls(h.llm)[0]!.user;
    for (const secret of Object.values(SECRETS)) expect(user).toContain(secret);

    const logged = JSON.stringify(h.events);
    for (const secret of Object.values(SECRETS)) expect(logged).not.toContain(secret);
    expect(logged).not.toContain('@@');
    expect(h.events.length).toBeGreaterThan(3);
  });

  it('reports how long gathering took and how many GitHub reads it made, counting the base re-read', async () => {
    const h = setup({
      pull: { body: `${PLAIN_BODY} Closes #471. See [the spec](${DOC_PATH}).` },
      github: { issues: { 471: ISSUE_471 } },
    });
    await ensure(h);
    // One issue read, the document at the head (not found) and once more at the base.
    const line = h.events.find((e) => e.msg.startsWith('Intent gathered in '))!;
    expect(line.kind).toBe('info');
    expect(line.msg).toMatch(/^Intent gathered in \d+ ms · 3 GitHub read\(s\)$/);
    const done = h.events.find((e) => e.msg.startsWith('Intent classifier done ←'))!;
    const data = done.data as Record<string, unknown>;
    expect(data.github_reads).toBe(3);
    expect(typeof data.gather_ms).toBe('number');
  });

  it('makes no GitHub read for a description without references', async () => {
    const h = setup();
    await ensure(h);
    expect(h.events.map((e) => e.msg).find((m) => m.startsWith('Intent gathered in '))).toMatch(
      / · 0 GitHub read\(s\)$/,
    );
  });

  it('says so when the classifier needed a second attempt, and stays silent after a single one', async () => {
    const single = setup();
    await ensure(single);
    expect(single.events.some((e) => e.msg.startsWith('Intent classifier needed'))).toBe(false);

    const llm = new MockLLMProvider('openrouter', { structuredBySchema: { IntentClassification: CLASSIFICATION } });
    const original = llm.completeStructured.bind(llm);
    llm.completeStructured = (async (req: Parameters<typeof original>[0]) => ({
      ...(await original(req)),
      attempts: 2,
    })) as typeof llm.completeStructured;
    const retried = setup({ llm });
    await ensure(retried);
    const line = retried.events.find((e) => e.msg.startsWith('Intent classifier needed'))!;
    expect(line.kind).toBe('info');
    expect(line.msg).toBe(
      'Intent classifier needed 2 attempts — an earlier output did not match the schema; tokens and cost are the sum',
    );
  });

  it('gives the classifier an output budget with room for a reasoning model', async () => {
    const h = setup();
    await ensure(h);
    const call = h.llm.calls.find((c) => c.method === 'completeStructured')!;
    expect((call.req as { maxTokens?: number }).maxTokens).toBe(2000);
  });

  it('asks for an answer without the reasoning pass, and for a call it can cancel', async () => {
    const h = setup();
    await ensure(h);
    const req = h.llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      reasoning?: boolean;
      signal?: AbortSignal;
    };
    expect(req.reasoning).toBe(false);
    expect(req.signal).toBeInstanceOf(AbortSignal);
    // A call that finished is not aborted afterwards.
    expect(req.signal!.aborted).toBe(false);
  });

  it('cancels the provider call when the classifier fails or times out', async () => {
    let seen: AbortSignal | undefined;
    const llm = new MockLLMProvider('openrouter', { structuredBySchema: { IntentClassification: CLASSIFICATION } });
    llm.completeStructured = (async (req: { signal?: AbortSignal }) => {
      seen = req.signal;
      throw new TimeoutError(30_000);
    }) as typeof llm.completeStructured;
    const h = setup({ llm });
    expect(await ensure(h)).toMatchObject({ outcome: 'unavailable', reason: 'timeout' });
    expect(seen!.aborted).toBe(true);
  });

  it('names the model and the sources on the done event data', async () => {
    const h = setup({ pull: { body: `${PLAIN_BODY} Closes #471.` }, github: { issues: { 471: ISSUE_471 } } });
    await ensure(h);
    const done = h.events.find((e) => e.msg.startsWith('Intent classifier done ←'))!;
    const data = done.data as Record<string, unknown>;

    expect(data['gen_ai.request.model']).toBe(DEFAULT_MODEL);
    expect(data['gen_ai.usage.input_tokens']).toBe(100);
    expect(data['gen_ai.usage.output_tokens']).toBe(50);
    expect(data.confidence).toBe('high');
    expect(data.sources).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'linked_issue', ref: '#471', status: 'used' })]),
    );
  });
});

// ------------------------------------------------------------------ an unreadable stored row

describe('IntentService — an unreadable stored row', () => {
  const LINE = 'Intent: stored row unreadable (sources) — treated as not derived';

  it('get resolves null and the sink receives exactly one info event', async () => {
    const h = setup();
    h.store.unreadable = ['sources'];

    expect(await h.service.get('ws', 'pr-1', { onEvent: h.onEvent })).toBeNull();
    expect(h.events).toEqual([{ kind: 'info', msg: LINE, data: undefined }]);
  });

  it('names every failed column, joined by a comma', async () => {
    const h = setup();
    h.store.unreadable = ['sources', 'confidence'];

    await h.service.get('ws', 'pr-1', { onEvent: h.onEvent });
    expect(h.events.map((e) => e.msg)).toEqual([
      'Intent: stored row unreadable (sources, confidence) — treated as not derived',
    ]);
  });

  it('ensure treats it as absent: computes, emits the line and upserts', async () => {
    const h = setup();
    h.store.unreadable = ['sources'];
    const res = await ensure(h);

    expect(res.outcome).toBe('computed');
    expect(h.events.filter((e) => e.msg === LINE)).toHaveLength(1);
    expect(h.events.find((e) => e.msg === LINE)!.kind).toBe('info');
    expect(h.store.upserts).toHaveLength(1);
    expect(classifierCalls(h.llm)).toHaveLength(1);
    expect(kinds(h.events)).not.toContain('error');
  });
});
