import { ZodError } from 'zod';
import { OutputTruncatedError } from '@devdigest/reviewer-core';
import type {
  BlastRadius,
  BlastRadiusResponse,
  BriefInput,
  GitHubClient,
  Intent,
  LLMProvider,
  PrBriefRecord,
  PrBriefResponse,
  Provider,
  StructuredResult,
} from '@devdigest/shared';
import { AppError, ConfigError, ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { classifyFile } from '../_shared/file-role/classify.js';
import { sanitizeText } from '../_shared/text/plain-text.js';
import {
  BRIEF_SCHEMA_NAME,
  CALL_TIMEOUT_MS,
  INPUT_BUDGET_TOKENS,
  MAX_REPAIR_RETRIES,
  OUTPUT_MAX_TOKENS,
} from './constants.js';
import {
  BriefModelOutput,
  capBrief,
  findLinkedIssueNumber,
  fitToBudget,
  parseNewSideRanges,
  recordInputs,
  selectReviewFindings,
  validateDraft,
  type BriefFacts,
  type BriefFile,
  type BriefIssue,
  type BriefOrigin,
  type BriefTrims,
  type LineRange,
} from './domain.js';
import { buildBriefMessages } from './prompt.js';
import type {
  BriefBlastSource,
  BriefDocumentSource,
  BriefIntentSource,
  BriefLog,
  BriefPull,
  BriefStore,
} from './ports.js';

/**
 * L05 — the brief service. `get` serves the stored brief with `stale` computed on read (no model,
 * no GitHub). `generate` collects the facts DevDigest already holds, fits them into the input
 * budget, makes one structured `risk_brief` call, validates the answer against the PR's files
 * and blast map, and stores it with the head SHA. The pure rules are `domain.ts`; the request
 * logger is a parameter because a service cannot import Fastify.
 *
 * Both log lines of a model call carry ids, counts and reason codes only — never pull-request
 * text, document text, model output or an error message.
 */

export interface BriefServiceDeps {
  store: BriefStore;
  intent: BriefIntentSource;
  blast: BriefBlastSource;
  documents: BriefDocumentSource;
  /** Lazy: may throw `ConfigError` when no token is configured. */
  github: () => Promise<GitHubClient>;
  /** Lazy: may throw `ConfigError` when the provider has no key. */
  llm: (p: Provider) => Promise<LLMProvider>;
  tokenizer: { count(text: string): number };
  /** Test seam: the call timeout, default `CALL_TIMEOUT_MS`. */
  callTimeoutMs?: number;
  now?: () => Date;
}

type BriefFailureReason = 'timeout' | 'output_truncated' | 'schema_invalid' | 'model_failed';

function failureReason(err: unknown): BriefFailureReason {
  if (err instanceof TimeoutError) return 'timeout';
  // The OpenRouter provider ends an over-long call itself (`withDeadline`) with a plain Error.
  if (err instanceof Error && /did not finish within \d+s/.test(err.message)) return 'timeout';
  // The answer did not fit `OUTPUT_MAX_TOKENS`; the provider does not retry that.
  if (err instanceof OutputTruncatedError) return 'output_truncated';
  const message = err instanceof Error ? err.message : '';
  if (err instanceof ZodError || /schema/i.test(message)) return 'schema_invalid';
  return 'model_failed';
}

/** The trims a smaller `facts` implies against the `original`, so a count can name them exactly. */
function trimsOf(original: BriefFacts, facts: BriefFacts): BriefTrims {
  return {
    documents: original.documents.length - facts.documents.length,
    findings: original.findings.length - facts.findings.length,
    issueBodyCut: original.issue !== null && facts.issue !== null && original.issue.body !== facts.issue.body,
    issueDropped: original.issue !== null && facts.issue === null,
    descriptionCut: original.description !== facts.description,
    callers: (original.blast?.callers.length ?? 0) - (facts.blast?.callers.length ?? 0),
    files: original.files.length - facts.files.length,
  };
}

function callerLines(blast: BlastRadiusResponse): string[] {
  return blast.downstream.flatMap((d) => d.callers.map((c) => `${c.file}:${c.line} ${c.name}`));
}

/** The map as sent: the callers left out by the budget are removed from the end of the flat list. */
function sentBlast(blast: BlastRadiusResponse, omittedCallers: number): BlastRadius {
  let keep = callerLines(blast).length - omittedCallers;
  return {
    changed_symbols: blast.changed_symbols,
    downstream: blast.downstream.map((d) => {
      const callers = d.callers.slice(0, Math.max(keep, 0));
      keep -= d.callers.length;
      return { ...d, callers };
    }),
    summary: blast.summary,
  };
}

export class BriefService {
  private readonly inFlight = new Map<string, Promise<PrBriefResponse>>();

  constructor(private readonly deps: BriefServiceDeps) {}

  /** The stored brief, `stale` computed on read; `{ brief: null }` for no row or an unreadable one. */
  async get(workspaceId: string, prId: string, log: BriefLog): Promise<PrBriefResponse> {
    const { store } = this.deps;
    const pull = await store.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const record = await store.readBrief(prId, {
      onUnreadable: () => log.info({ prId }, 'brief: stored row unreadable — treated as no brief'),
    });
    if (!record) return { brief: null };
    return { brief: { ...record, stale: record.head_sha !== pull.headSha } };
  }

  /** One model call, one stored brief. A second call for the same PR joins the running one. */
  async generate(workspaceId: string, prId: string, log: BriefLog): Promise<PrBriefResponse> {
    const { store } = this.deps;
    const pull = await store.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const files = await store.changedFiles(prId);
    if (files.length === 0) throw new ValidationError("The PR's changed files are not loaded yet");

    // The provider is resolved before any GitHub call, so a missing key costs no network.
    const choice = await store.featureModel(workspaceId);
    let llm: LLMProvider;
    try {
      llm = await this.deps.llm(choice.provider);
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      throw new AppError(
        'brief_unavailable',
        `No API key is configured for the risk brief model's provider (${choice.provider}). Add it in Settings.`,
        400,
      );
    }

    const running = this.inFlight.get(prId);
    if (running) return running;
    const started = (async () => {
      try {
        return await this.run({ workspaceId, pull, files, choice, llm, log });
      } finally {
        this.inFlight.delete(prId);
      }
    })();
    this.inFlight.set(prId, started);
    return started;
  }

  // ------------------------------------------------------------ internals

  private async run(ctx: {
    workspaceId: string;
    pull: BriefPull;
    files: Awaited<ReturnType<BriefStore['changedFiles']>>;
    choice: { provider: Provider; model: string };
    llm: LLMProvider;
    log: BriefLog;
  }): Promise<PrBriefResponse> {
    const { workspaceId, pull, files, choice, llm, log } = ctx;
    const { store, tokenizer } = this.deps;
    const callTimeoutMs = this.deps.callTimeoutMs ?? CALL_TIMEOUT_MS;
    const now = this.deps.now ?? (() => new Date());

    // ---- gather
    const intent = await this.deps.intent.get(workspaceId, pull.id);
    const blast = await this.readBlast(workspaceId, pull.id, log);
    const blastHasSymbols = blast !== null && blast.changed_symbols.length > 0;

    const title = sanitizeText(pull.title).text;
    const description = sanitizeText(pull.body ?? '').text;
    const { issue, miss: issueMiss } = await this.readIssue(pull, description);

    const reviewFindings = selectReviewFindings(await store.latestReviewFindings(pull.id));
    const docs = await this.deps.documents.forWorkspace({ workspaceId, repo: pull.repo });

    const briefFiles: BriefFile[] = files.map((f) => ({
      path: f.path,
      role: classifyFile(f.path),
      additions: f.additions,
      deletions: f.deletions,
      ranges: parseNewSideRanges(f.patch),
    }));
    // The PR's own totals; a row whose stats were never filled in (all zero) is summed from the files.
    const hasStats = pull.filesCount > 0 || pull.additions > 0 || pull.deletions > 0;
    const totals = hasStats
      ? { files: pull.filesCount, additions: pull.additions, deletions: pull.deletions }
      : {
          files: files.length,
          additions: files.reduce((n, f) => n + f.additions, 0),
          deletions: files.reduce((n, f) => n + f.deletions, 0),
        };

    const intentFacts: Intent | null =
      intent === null
        ? null
        : { summary: intent.summary, in_scope: intent.in_scope, out_of_scope: intent.out_of_scope };

    const facts: BriefFacts = {
      title,
      intent: intentFacts,
      files: briefFiles,
      totals,
      blast:
        blast !== null && blastHasSymbols
          ? { summary: blast.summary, totals: blast.totals, callers: callerLines(blast) }
          : null,
      findings: reviewFindings,
      description: description.length > 0 ? description : null,
      issue,
      documents: docs.documents,
    };
    const origin: BriefOrigin = {
      intent: { present: intent !== null, stale: intent?.stale ?? false },
      blast: { hasSymbols: blastHasSymbols, reason: blast?.reason ?? null },
      descriptionEmpty: description.length === 0,
      issueMiss,
      documents: {
        attached: docs.attached,
        read: docs.documents.length,
        notCloned: docs.notCloned,
        allSkipped: !docs.notCloned && docs.attached > 0 && docs.documents.length === 0,
      },
    };

    // ---- build and fit
    const buildFor = (f: BriefFacts) => {
      const inputs = recordInputs(origin, trimsOf(facts, f));
      return buildBriefMessages(f, {
        missing: inputs.filter((i) => i.status === 'missing'),
        trimmed: inputs.filter((i) => i.status === 'trimmed'),
      });
    };
    const measure = (f: BriefFacts): number =>
      tokenizer.count(
        buildFor(f)
          .map((m) => m.content)
          .join('\n'),
      );
    const fit = fitToBudget(facts, measure, INPUT_BUDGET_TOKENS, (text) => tokenizer.count(text));
    const inputs: BriefInput[] = recordInputs(origin, fit.trims);
    const messages = buildFor(fit.facts);

    // ---- call, validate
    log.info(
      {
        prId: pull.id,
        provider: choice.provider,
        model: choice.model,
        inputTokens: fit.tokens,
        budgetTokens: INPUT_BUDGET_TOKENS,
        inputs: Object.fromEntries(inputs.map((i) => [i.kind, i.status])),
        reviewFindings: fit.facts.findings.length,
      },
      'Brief model call →',
    );

    const startedAt = Date.now();
    let result: StructuredResult<BriefModelOutput> | null = null;
    let outcome: 'ok' | 'failed' = 'failed';
    let reason: BriefFailureReason | null = null;
    let dropped: { risks: number; review_focus: number } | null = null;
    let brief: ReturnType<typeof capBrief>;
    // `withTimeout` only stops waiting; the controller makes the provider drop the request.
    const abort = new AbortController();
    try {
      result = await withTimeout(
        llm.completeStructured<BriefModelOutput>({
          model: choice.model,
          schema: BriefModelOutput,
          schemaName: BRIEF_SCHEMA_NAME,
          messages,
          temperature: 0,
          maxTokens: OUTPUT_MAX_TOKENS,
          maxRetries: MAX_REPAIR_RETRIES,
          timeoutMs: callTimeoutMs,
          reasoning: false,
          signal: abort.signal,
        }),
        callTimeoutMs,
      );
      // Validated against every changed file of the PR and the map as sent.
      const validated = validateDraft(result.data, {
        changedFiles: new Map<string, LineRange[] | null>(briefFiles.map((f) => [f.path, f.ranges])),
        blastFiles: blastFilesOf(blast === null ? null : sentBlast(blast, fit.trims.callers)),
      });
      dropped = validated.dropped;
      brief = capBrief(result.data.summary, validated.risks, validated.review_focus);
      outcome = 'ok';
    } catch (err) {
      abort.abort();
      reason = failureReason(err);
      throw new ExternalServiceError(`Brief generation failed (${reason})`);
    } finally {
      log.info(
        {
          prId: pull.id,
          outcome,
          reason,
          tokensIn: result?.tokensIn ?? null,
          tokensOut: result?.tokensOut ?? null,
          costUsd: result?.costUsd ?? null,
          attempts: result?.attempts ?? null,
          ms: Date.now() - startedAt,
          dropped: outcome === 'ok' ? dropped : null,
        },
        'Brief model call done ←',
      );
    }

    // ---- store
    const record: Omit<PrBriefRecord, 'stale'> = {
      summary: brief.summary,
      intent: intentFacts,
      blast: blastHasSymbols && blast !== null ? sentBlast(blast, fit.trims.callers) : null,
      risks: { risks: brief.risks },
      review_focus: brief.review_focus,
      history: { history: [] },
      pr_id: pull.id,
      head_sha: pull.headSha,
      generated_at: now().toISOString(),
      provider: choice.provider,
      model: choice.model,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd,
      input_tokens: fit.tokens,
      input_budget_tokens: INPUT_BUDGET_TOKENS,
      inputs,
      dropped: dropped ?? { risks: 0, review_focus: 0 },
    };
    await store.saveBrief(pull.id, record);
    return { brief: { ...record, stale: false } };
  }

  /** The blast map; a failed read is recorded as `no_data` and the brief goes on (AC-53). */
  private async readBlast(workspaceId: string, prId: string, log: BriefLog): Promise<BlastRadiusResponse | null> {
    try {
      return await this.deps.blast.forPull(workspaceId, prId, log);
    } catch {
      return null;
    }
  }

  /** The first `#N` of the description, read once from the PR's own repository. */
  private async readIssue(
    pull: BriefPull,
    description: string,
  ): Promise<{ issue: BriefIssue | null; miss: BriefOrigin['issueMiss'] }> {
    const number = findLinkedIssueNumber(description);
    if (number === null) return { issue: null, miss: 'none_linked' };

    let github: GitHubClient;
    try {
      github = await this.deps.github();
    } catch (err) {
      return { issue: null, miss: err instanceof ConfigError ? 'no_token' : 'fetch_failed' };
    }
    try {
      const meta = await github.getIssue({ owner: pull.repo.owner, name: pull.repo.name }, number);
      if (meta === null) return { issue: null, miss: 'not_found' };
      return {
        issue: { number, title: sanitizeText(meta.title).text, body: sanitizeText(meta.body ?? '').text },
        miss: null,
      };
    } catch {
      return { issue: null, miss: 'fetch_failed' };
    }
  }
}

function blastFilesOf(blast: BlastRadius | null): Set<string> {
  const files = new Set<string>();
  if (blast === null) return files;
  for (const s of blast.changed_symbols) files.add(s.file);
  for (const d of blast.downstream) for (const c of d.callers) files.add(c.file);
  return files;
}
