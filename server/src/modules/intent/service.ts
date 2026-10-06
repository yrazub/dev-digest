import { ZodError } from 'zod';
import { FEATURE_MODELS } from '@devdigest/shared';
import { OutputTruncatedError } from '@devdigest/reviewer-core';
import type {
  FeatureModelChoice,
  GitHubClient,
  IntentSource,
  IntentSourceReason,
  LLMProvider,
  PrIntentRecord,
  Provider,
  RepoRef,
  RunEventKind,
  StructuredResult,
} from '@devdigest/shared';
import { AppError, ConfigError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import {
  DESCRIPTION_MAX_CHARS,
  DOCUMENT_MAX_BYTES,
  IntentClassification,
  MAX_REF_CHARS,
  clampClassification,
  deriveConfidence,
  documentMissReason,
  extractReferences,
  formatChangedFiles,
  hasMissingContext,
  isSubstantiveDescription,
  sanitizeText,
  sourceHash,
  type IntentReference,
} from './domain.js';
import {
  buildIntentMessages,
  type IntentDocumentInput,
  type IntentIssueInput,
  type IntentPrompt,
} from './prompt.js';
import type { IntentPullContext, IntentStore, StoredIntent } from './ports.js';

/**
 * L03 — the intent service. Derives `Intent` for a pull request with a separate cheap
 * classifier model (chosen in Settings), stores it per PR and serves it back.
 *
 *   get(ws, pr)          → the stored record with `stale` computed on read (never computes);
 *                          null when no row exists or the stored one is unreadable
 *   ensure(ws, pr)       → shared pre-work of a review run: cached when the hash matches,
 *                          else computed; never throws for a provider, GitHub or model failure
 *   regenerate(ws, pr)   → forced recompute for the route; throws an `AppError`
 *
 * Sequence of a computation: hash check → provider resolved (a missing key costs no
 * network) → bounded gathering of the issue and document references → sanitise, cap,
 * build the messages → one classifier call → clamp, confidence, upsert. Every source text
 * is untrusted; lines go through the caller's sink and carry lengths, counts, references
 * and reasons — never source text, hunk headers or the model's raw output.
 */

/** Time allowed for fetching issues and documents, and for the classifier call. */
const GATHER_TIMEOUT_MS = 20_000;
const CLASSIFIER_TIMEOUT_MS = 30_000;
/**
 * Output budget of one classifier attempt. The default model is a reasoning model and its
 * reasoning tokens count against this limit: at 800 a PR with a linked document spent 577
 * tokens thinking, was cut off mid-JSON (`finish_reason: length`) and paid for a second
 * attempt. The answer itself is about 200–450 tokens; the rest is headroom for reasoning.
 */
const CLASSIFIER_MAX_TOKENS = 2000;
const CLASSIFIER_MAX_RETRIES = 1;

export type IntentEventSink = (kind: RunEventKind, msg: string, data?: unknown) => void;

export interface IntentDeps {
  store: IntentStore;
  /** Lazy: may throw `ConfigError` when no token is configured. */
  github: () => Promise<GitHubClient>;
  /** Lazy: may throw `ConfigError` when the provider has no key. */
  llm: (p: Provider) => Promise<LLMProvider>;
  tokenizer: { count(text: string): number };
}

export interface IntentCallStats {
  provider: string;
  model: string;
  tokensEstimated: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  durationMs: number;
  attempts: number;
}

export type IntentFailureReason =
  | 'no_api_key'
  | 'model_failed'
  | 'schema_invalid'
  | 'output_truncated'
  | 'timeout'
  | 'pull_not_found';

export interface EnsureResult {
  record: PrIntentRecord | null;
  outcome: 'cached' | 'computed' | 'unavailable';
  reason?: IntentFailureReason;
  /** Stored values when cached. */
  call?: IntentCallStats;
}

type RunResult =
  | { ok: true; record: PrIntentRecord; outcome: 'cached' | 'computed'; call: IntentCallStats }
  | { ok: false; reason: IntentFailureReason; provider?: Provider };

interface Gathered {
  title: string;
  description: string;
  issues: IntentIssueInput[];
  documents: IntentDocumentInput[];
  sources: IntentSource[];
  removed: { html_comments: number; invisible_chars: number };
  /** GitHub requests made while gathering (issues, documents, base-branch re-reads). */
  reads: number;
}

interface ReferenceResult {
  source: IntentSource;
  issue?: IntentIssueInput;
  document?: IntentDocumentInput;
}

const noop: IntentEventSink = () => undefined;

function defaultChoice(): FeatureModelChoice {
  const def = FEATURE_MODELS.find((f) => f.id === 'review_intent');
  if (!def) throw new Error('FEATURE_MODELS has no review_intent entry');
  return { provider: def.defaultProvider, model: def.defaultModel };
}

/** A reference the author wrote, safe for a log line: one line, printable, capped. */
function logRef(ref: string | null): string {
  if (!ref) return '(none)';
  return ref
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?')
    .slice(0, MAX_REF_CHARS);
}

function failureReason(err: unknown): IntentFailureReason {
  if (err instanceof TimeoutError) return 'timeout';
  // The answer did not fit `CLASSIFIER_MAX_TOKENS`; the provider does not retry that.
  if (err instanceof OutputTruncatedError) return 'output_truncated';
  const message = err instanceof Error ? err.message : '';
  if (err instanceof ZodError || /schema/i.test(message)) return 'schema_invalid';
  return 'model_failed';
}

function storedCall(stored: StoredIntent, choice: FeatureModelChoice): IntentCallStats {
  return {
    provider: stored.provider ?? choice.provider,
    model: stored.model ?? choice.model,
    tokensEstimated: null,
    tokensIn: stored.tokensIn,
    tokensOut: stored.tokensOut,
    costUsd: stored.costUsd,
    durationMs: 0,
    attempts: 0,
  };
}

function toRecord(stored: StoredIntent, stale: boolean): PrIntentRecord {
  return {
    pr_id: stored.prId,
    summary: stored.summary,
    in_scope: stored.inScope,
    out_of_scope: stored.outOfScope,
    risk_areas: stored.riskAreas,
    confidence: stored.confidence,
    sources: stored.sources,
    missing_context: stored.missingContext,
    injection_suspected: stored.injectionSuspected,
    stale,
    model: stored.model,
    cost_usd: stored.costUsd,
    computed_at: stored.computedAt.toISOString(),
  };
}

function sourceLabel(s: IntentSource): string {
  if (s.status === 'unavailable') return logRef(s.ref);
  switch (s.kind) {
    case 'title':
      return 'title';
    case 'description':
      return 'description';
    case 'changed_files':
      return 'changed files';
    case 'linked_issue':
      return `issue ${logRef(s.ref)}`;
    default:
      return logRef(s.ref);
  }
}

/** The prompt component a source became, by label (`issue #471`, `document <path>`, …). */
function componentLabel(s: IntentSource): string | null {
  switch (s.kind) {
    case 'title':
      return 'title';
    case 'description':
      return 'description';
    case 'changed_files':
      return 'changed files';
    case 'linked_issue':
      return `issue ${s.ref ?? ''}`;
    case 'spec_document':
      return `document ${s.ref ?? ''}`;
    default:
      return null;
  }
}

function formatCost(costUsd: number | null): string {
  return costUsd === null ? 'cost n/a' : `$${costUsd.toFixed(4)}`;
}

export class IntentService {
  constructor(private readonly deps: IntentDeps) {}

  /**
   * The stored intent with `stale` computed on read; `null` until one was derived, and for a
   * stored row the store reports as unreadable (one `info` event). 404 for an unknown PR.
   */
  async get(workspaceId: string, prId: string, opts: { onEvent?: IntentEventSink } = {}): Promise<PrIntentRecord | null> {
    const ctx = await this.deps.store.getPullContext(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');
    const stored = await this.readStored(prId, opts.onEvent ?? noop);
    if (!stored) return null;
    const choice = await this.resolveChoice(workspaceId);
    // A null hash (the seeded demo row) is never stale on read; a review run still recomputes it.
    const stale = stored.sourceHash !== null && stored.sourceHash !== this.hashFor(ctx, choice);
    return toRecord(stored, stale);
  }

  /** Shared pre-work of a review run. Never throws for a provider, GitHub or model failure. */
  async ensure(
    workspaceId: string,
    prId: string,
    opts: { onEvent?: IntentEventSink } = {},
  ): Promise<EnsureResult> {
    const res = await this.run(workspaceId, prId, false, opts.onEvent ?? noop);
    if (!res.ok) return { record: null, outcome: 'unavailable', reason: res.reason };
    return { record: res.record, outcome: res.outcome, call: res.call };
  }

  /** Forced recompute (the card's Derive / Re-run). A missing key is a 400, a model failure a 502. */
  async regenerate(
    workspaceId: string,
    prId: string,
    opts: { onEvent?: IntentEventSink } = {},
  ): Promise<PrIntentRecord> {
    const res = await this.run(workspaceId, prId, true, opts.onEvent ?? noop);
    if (res.ok) return res.record;
    if (res.reason === 'pull_not_found') throw new NotFoundError('Pull request not found');
    if (res.reason === 'no_api_key') {
      throw new AppError(
        'intent_unavailable',
        `No API key is configured for the intent model's provider (${res.provider ?? 'unknown'}). Add it in Settings.`,
        400,
      );
    }
    throw new ExternalServiceError(`Intent classification failed (${res.reason})`);
  }

  // ------------------------------------------------------------ internals

  /** The stored row; an unreadable one is logged by column name and treated as absent. */
  private readStored(prId: string, emit: IntentEventSink): Promise<StoredIntent | undefined> {
    return this.deps.store.getIntent(prId, {
      onUnreadable: ({ columns }) =>
        emit('info', `Intent: stored row unreadable (${columns.join(', ')}) — treated as not derived`),
    });
  }

  private async resolveChoice(workspaceId: string): Promise<FeatureModelChoice> {
    return (await this.deps.store.featureModelOverride(workspaceId)) ?? defaultChoice();
  }

  private hashFor(ctx: IntentPullContext, choice: FeatureModelChoice): string {
    return sourceHash({
      provider: choice.provider,
      model: choice.model,
      headSha: ctx.pull.headSha,
      title: ctx.pull.title,
      body: ctx.pull.body,
    });
  }

  private async run(workspaceId: string, prId: string, force: boolean, emit: IntentEventSink): Promise<RunResult> {
    const ctx = await this.deps.store.getPullContext(workspaceId, prId, { includeFiles: true });
    if (!ctx) return { ok: false, reason: 'pull_not_found' };

    const choice = await this.resolveChoice(workspaceId);
    const hash = this.hashFor(ctx, choice);
    const modelName = `${choice.provider}/${choice.model}`;

    const existing = await this.readStored(prId, emit);
    if (!force && existing && existing.sourceHash === hash) {
      emit(
        'info',
        `Intent: cached (${existing.confidence} confidence, head ${ctx.pull.headSha.slice(0, 7)}) — classifier not called`,
      );
      return {
        ok: true,
        record: toRecord(existing, false),
        outcome: 'cached',
        call: storedCall(existing, choice),
      };
    }

    const fail = (reason: IntentFailureReason): RunResult => {
      emit('info', `Intent unavailable (${reason}) — continuing without it`);
      return { ok: false, reason, provider: choice.provider };
    };

    // The provider is resolved before any GitHub call, so a missing key costs no network.
    let llm: LLMProvider;
    try {
      llm = await this.deps.llm(choice.provider);
    } catch (err) {
      return fail(err instanceof ConfigError ? 'no_api_key' : 'model_failed');
    }

    let gathered: Gathered;
    const gatherStartedAt = Date.now();
    try {
      gathered = await withTimeout(this.gather(ctx), GATHER_TIMEOUT_MS);
    } catch (err) {
      return fail(failureReason(err) === 'timeout' ? 'timeout' : 'model_failed');
    }
    const { sources } = gathered;
    const gatherMs = Date.now() - gatherStartedAt;

    const unavailable = sources.filter((s) => s.status === 'unavailable');
    const prompt = buildIntentMessages({
      title: gathered.title,
      description: gathered.description,
      issues: gathered.issues,
      documents: gathered.documents,
      changedFiles: ctx.files,
      unavailable,
    });
    const tokensEstimated = this.deps.tokenizer.count(prompt.messages.map((m) => m.content).join('\n'));

    const used = sources.filter((s) => s.status === 'used').map(sourceLabel);
    const unread = unavailable.map((s) => `${sourceLabel(s)} (${s.reason ?? 'unavailable'})`);
    emit(
      'info',
      `Intent sources: read ${used.join(', ') || 'nothing'}${unread.length > 0 ? ` · unavailable ${unread.join(', ')}` : ''}`,
    );
    emit('info', `Intent gathered in ${gatherMs} ms · ${gathered.reads} GitHub read(s)`);
    emit('info', this.componentsLine(prompt, ctx, gathered));
    const { html_comments, invisible_chars } = gathered.removed;
    if (html_comments > 0 || invisible_chars > 0) {
      emit('info', `Intent sanitiser: ${html_comments} HTML comment(s), ${invisible_chars} invisible char(s) removed`);
    }

    emit('tool', `Intent classifier call → ${modelName} · ~${tokensEstimated} tok estimated`);
    const startedAt = Date.now();
    let result: StructuredResult<IntentClassification>;
    // `withTimeout` only stops waiting. The controller makes the provider drop the HTTP
    // request and start no further attempt, so an abandoned call is not paid for.
    const abort = new AbortController();
    try {
      result = await withTimeout(
        llm.completeStructured<IntentClassification>({
          model: choice.model,
          schema: IntentClassification,
          schemaName: 'IntentClassification',
          messages: prompt.messages,
          temperature: 0,
          maxTokens: CLASSIFIER_MAX_TOKENS,
          maxRetries: CLASSIFIER_MAX_RETRIES,
          timeoutMs: CLASSIFIER_TIMEOUT_MS,
          // A narrow extraction step: the reasoning pass was 60–70% of the output tokens
          // and of the latency, with the same scope lists as a result.
          reasoning: false,
          signal: abort.signal,
        }),
        CLASSIFIER_TIMEOUT_MS,
      );
    } catch (err) {
      abort.abort();
      return fail(failureReason(err));
    }
    const durationMs = Date.now() - startedAt;

    const classification = clampClassification(result.data);
    // An answer that matches the schema but says nothing (an empty summary) is not an intent:
    // storing it would show an empty card and put an empty block into every review prompt.
    if (classification.summary.length === 0) {
      abort.abort();
      return fail('schema_invalid');
    }
    const derived = deriveConfidence({
      sources,
      substantiveDescription: isSubstantiveDescription(gathered.description),
      basis: classification.basis,
      injectionSuspected: classification.injection_suspected,
    });
    const missingContext = hasMissingContext(sources);

    const call: IntentCallStats = {
      provider: choice.provider,
      model: choice.model,
      tokensEstimated,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      durationMs,
      attempts: result.attempts,
    };
    emit(
      'result',
      `Intent classifier done ← ${modelName} · ${call.tokensIn} in / ${call.tokensOut} out tok · ${formatCost(call.costUsd)} · ${call.attempts} attempt(s) · ${durationMs} ms`,
      {
        'gen_ai.request.model': choice.model,
        'gen_ai.usage.input_tokens': call.tokensIn,
        'gen_ai.usage.output_tokens': call.tokensOut,
        tokens_estimated: tokensEstimated,
        cost_usd: call.costUsd,
        latency_ms: durationMs,
        gather_ms: gatherMs,
        github_reads: gathered.reads,
        attempts: call.attempts,
        confidence: derived.confidence,
        outcome: 'computed',
        sources: this.sourceStats(sources, prompt),
        sanitizer: gathered.removed,
      },
    );

    if (call.attempts > 1) {
      emit(
        'info',
        `Intent classifier needed ${call.attempts} attempts — an earlier output did not match the schema; tokens and cost are the sum`,
      );
    }

    const stored = await this.deps.store.upsertIntent(prId, {
      summary: classification.summary,
      inScope: classification.in_scope,
      outOfScope: classification.out_of_scope,
      riskAreas: classification.risk_areas,
      confidence: derived.confidence,
      sources,
      missingContext,
      injectionSuspected: classification.injection_suspected,
      sourceHash: hash,
      provider: choice.provider,
      model: choice.model,
      tokensIn: call.tokensIn,
      tokensOut: call.tokensOut,
      costUsd: call.costUsd,
    });

    emit(
      'result',
      `Intent derived: ${derived.confidence} confidence · ${classification.in_scope.length} in scope · ${classification.out_of_scope.length} out of scope · ${classification.risk_areas.length} risk area(s)`,
    );
    if (derived.basisOverruled) {
      emit(
        'info',
        'Intent: the classifier reported its basis as insufficient, but a linked issue or specification was read — not applied',
      );
    }
    for (const downgrade of derived.downgrades) {
      if (downgrade === 'missing_context') {
        const afterMissing = deriveConfidence({
          sources,
          substantiveDescription: isSubstantiveDescription(gathered.description),
          basis: 'stated',
          injectionSuspected: false,
        }).confidence;
        emit('info', `Intent: missing context — confidence lowered to ${afterMissing}`);
      } else if (downgrade === 'basis_insufficient') {
        emit('info', 'Intent: basis insufficient — forced to low');
      } else {
        emit('info', 'Intent: injection suspected — forced to low');
      }
    }

    return { ok: true, record: toRecord(stored, false), outcome: 'computed', call };
  }

  /**
   * Sanitise the title and description, find every reference in the description and read
   * the fetchable ones (issues of this repository, documents of this repository). Each
   * reference ends as a `used` or `unavailable` source; a failed read never throws.
   */
  private async gather(ctx: IntentPullContext): Promise<Gathered> {
    const removed = { html_comments: 0, invisible_chars: 0 };
    const clean = (raw: string): string => {
      const r = sanitizeText(raw);
      removed.html_comments += r.removed.html_comments;
      removed.invisible_chars += r.removed.invisible_chars;
      return r.text;
    };

    const title = clean(ctx.pull.title);
    const description = clean(ctx.pull.body ?? '');
    const references = extractReferences(description, ctx.repo, {
      branch: ctx.pull.branch,
      base: ctx.pull.base,
    });

    let github: Promise<{ client: GitHubClient } | { error: 'no_token' | 'fetch_failed' }> | undefined;
    const getGithub = () =>
      (github ??= this.deps.github().then(
        (client) => ({ client }),
        (err: unknown) => ({ error: err instanceof ConfigError ? ('no_token' as const) : ('fetch_failed' as const) }),
      ));

    const unavailableSource = (ref: IntentReference, reason: IntentSourceReason): ReferenceResult => ({
      source: { kind: ref.kind, ref: ref.ref, status: 'unavailable', reason },
    });

    let reads = 0;
    const readReference = async (ref: IntentReference): Promise<ReferenceResult> => {
      if (!ref.fetchable) return unavailableSource(ref, ref.reason ?? 'unsupported');
      const gh = await getGithub();
      if ('error' in gh) return unavailableSource(ref, gh.error);
      const repo: RepoRef = ctx.repo;

      if (ref.kind === 'linked_issue' && ref.issueNumber !== undefined) {
        try {
          reads += 1;
          const issue = await gh.client.getIssue(repo, ref.issueNumber);
          if (issue === null) return unavailableSource(ref, 'not_found');
          return {
            source: { kind: 'linked_issue', ref: ref.ref, status: 'used', reason: null },
            issue: { number: ref.issueNumber, title: clean(issue.title), body: clean(issue.body ?? '') },
          };
        } catch (err) {
          return unavailableSource(ref, 'fetch_failed');
        }
      }

      if (ref.kind === 'spec_document' && ref.path !== undefined) {
        try {
          // The PR head first. Only a head that answers `not_found` is read again, once, at the
          // base branch (a fork's head SHA may not exist in the base repository); any other
          // answer from the head is final.
          reads += 1;
          let result = await gh.client.getFileContent(repo, ref.path, ctx.pull.headSha, {
            maxBytes: DOCUMENT_MAX_BYTES,
          });
          if (!result.file && result.reason === 'not_found' && ctx.pull.base !== ctx.pull.headSha) {
            reads += 1;
            result = await gh.client.getFileContent(repo, ref.path, ctx.pull.base, { maxBytes: DOCUMENT_MAX_BYTES });
          }
          if (!result.file) return unavailableSource(ref, documentMissReason(result.reason));
          return {
            source: { kind: 'spec_document', ref: ref.ref, status: 'used', reason: null },
            document: { path: ref.path, content: clean(result.file.content) },
          };
        } catch {
          return unavailableSource(ref, 'fetch_failed');
        }
      }

      return unavailableSource(ref, 'unsupported');
    };

    const results = await Promise.all(references.map(readReference));

    const sources: IntentSource[] = [{ kind: 'title', ref: null, status: 'used', reason: null }];
    if (description.length > 0) sources.push({ kind: 'description', ref: null, status: 'used', reason: null });
    sources.push(...results.map((r) => r.source));
    if (formatChangedFiles(ctx.files).text.length > 0) {
      sources.push({ kind: 'changed_files', ref: null, status: 'used', reason: null });
    }

    return {
      title,
      description,
      issues: results.flatMap((r) => (r.issue ? [r.issue] : [])),
      documents: results.flatMap((r) => (r.document ? [r.document] : [])),
      sources,
      removed,
      reads,
    };
  }

  /** `Intent prompt components: …` — sizes and counts only. */
  private componentsLine(prompt: IntentPrompt, ctx: IntentPullContext, gathered: Gathered): string {
    const files = formatChangedFiles(ctx.files);
    const unavailable = gathered.sources.filter((s) => s.status === 'unavailable').length;
    const parts = prompt.components.map((c) => {
      if (c.label === 'changed files') {
        return `changed files ${files.paths} paths, ${files.headers} hunk headers, ${c.chars} ch`;
      }
      if (c.label === 'unavailable references') return `unavailable references ${unavailable}`;
      if (c.label === 'system') return `system ${c.chars} ch`;
      const size =
        c.label === 'description' && c.truncated
          ? `${gathered.description.length}/${DESCRIPTION_MAX_CHARS} ch (truncated)`
          : `${c.chars} ch${c.truncated ? ' (truncated)' : ''}`;
      return `${logRef(c.label)} ${size}`;
    });
    return `Intent prompt components: ${parts.join(' · ')}`;
  }

  /** Per-source facts for the structured log data: reference, status, reason, size and truncation. */
  private sourceStats(sources: IntentSource[], prompt: IntentPrompt) {
    return sources.map((s) => {
      const label = componentLabel(s);
      const component = label ? prompt.components.find((c) => c.label === label) : undefined;
      return {
        kind: s.kind,
        ref: s.ref === null ? null : logRef(s.ref),
        status: s.status,
        reason: s.reason,
        chars: component?.chars ?? null,
        truncated: component?.truncated ?? false,
      };
    });
  }
}
