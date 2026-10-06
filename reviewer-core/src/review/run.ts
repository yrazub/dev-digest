import type {
  Finding,
  LLMProvider,
  PromptAssembly,
  Review,
  RunEventKind,
  UnifiedDiff,
} from '@devdigest/shared';
import { Review as ReviewSchema } from '@devdigest/shared';
import { assemblePrompt } from '../prompt.js';
import { groundFindings, groundingSummary } from '../grounding.js';
import { applyScopeFilter } from '../scope.js';
import { reduceReviews, scoreFromFindings, sliceDiff } from './reduce.js';

/**
 * reviewPullRequest — the review engine entry point.
 *
 * given (diff + resolved agent inputs + injected LLM) → grounded Review.
 *
 * This is the pure core lifted out of the server's `ReviewService.runOneAgent`:
 * assemble prompt → single-pass OR map-reduce per file → reduce → SHARED
 * citation-grounding gate. It performs NO I/O beyond the injected LLM provider
 * (no DB, GitHub, fs, memory retrieval, intent derivation, or persistence) — those stay in
 * the caller (server persists + streams SSE; runner posts + writes an artifact).
 *
 * Skill bodies / memory / specs are RESOLVED strings here: the caller turns
 * AgentManifest skill slugs into bodies (DB in the studio, fs in the runner).
 */

/** Default map-reduce threshold (matches the server's FILE_MAP_THRESHOLD_LINES). */
export const DEFAULT_MAP_THRESHOLD_LINES = 400;
/** Default structured-output reprompt retries (matches REVIEW_MAX_RETRIES). */
export const DEFAULT_REVIEW_MAX_RETRIES = 2;
/**
 * Output cap for one review call. Normal reviews used up to ~7k output tokens
 * (reasoning models count their thinking as output, and it grows with the
 * diff); runaway generations ran to 17k–135k. 16k leaves ~2× headroom and
 * still stops a provider that never closes its JSON.
 */
export const DEFAULT_REVIEW_MAX_TOKENS = 16_000;
/**
 * Longest a single review call may take, response body included. Sized for a
 * large diff on a slow provider (~16k tokens at ~50 tok/s).
 */
export const DEFAULT_REVIEW_CALL_TIMEOUT_MS = 300_000;

export type ReviewStrategy = 'auto' | 'single-pass' | 'map-reduce';
export type ReviewMode = 'single-pass' | 'map-reduce';

/** Progress event emitted during a review (server → SSE bus, runner → log). */
export interface ReviewEvent {
  kind: RunEventKind;
  msg: string;
  data?: unknown;
}

export interface ReviewInput {
  /** Agent system prompt (trusted). */
  systemPrompt: string;
  /** Model id understood by the injected provider (e.g. 'deepseek/deepseek-v4-flash'). */
  model: string;
  /** The PR's unified diff (already parsed; hunks carry new-side line numbers). */
  diff: UnifiedDiff;
  /** Injected LLM provider (OpenRouter in CI, OpenAI/Anthropic in the studio). */
  llm: LLMProvider;
  /** 'auto' (default) picks single-pass unless the diff is large + multi-file. */
  strategy?: ReviewStrategy;
  /** Resolved skill bodies (NOT slugs). */
  skills?: string[];
  /** Curated memory items. */
  memory?: string[];
  /** Project-context spec chunks (untrusted; delimiter-wrapped downstream). */
  specs?: string[];
  /**
   * Optional callers-of-changed-symbols digest (T1.3). Untrusted; rendered
   * before the diff section. Empty/undefined → section omitted.
   */
  callers?: string;
  /**
   * Optional repo skeleton / map (T3). Untrusted; rendered before the project
   * context section. Empty/undefined → section omitted.
   */
  repoMap?: string;
  /** PR author's description/body (untrusted; truncated + delimiter-wrapped in
      the prompt). Empty/undefined → section omitted. */
  prDescription?: string;
  /**
   * The PR's derived intent block, rendered by the caller (untrusted; truncated
   * + delimiter-wrapped in the prompt). When present the model tags each finding
   * with a `scope`. Empty/undefined → section omitted, no tagging.
   */
  intent?: string;
  /**
   * Apply the deterministic scope filter after grounding: findings tagged
   * `out_of_scope` are removed unless serious (CRITICAL / security WARNING) or a
   * scanner kind. Off unless true — a tagged finding is kept when it is false or
   * omitted.
   */
  scopeFilter?: boolean;
  /** Task framing line, e.g. "Review PR #482 …". */
  task?: string;
  /** Override the structured-output retry budget. */
  maxRetries?: number;
  /** Override the map-reduce line threshold. */
  mapThresholdLines?: number;
  /**
   * OpenRouter session id — forwarded on every LLM call so all chunks of this
   * review group into one session in the OpenRouter dashboard.
   */
  sessionId?: string;
  /** Progress sink. */
  onEvent?: (e: ReviewEvent) => void;
  /**
   * Cancellation checkpoint, called before each (expensive) chunk LLM call.
   * Supply a function that THROWS to abort mid-run (the caller owns the error
   * type, e.g. the server's RunCancelledError); the engine stays agnostic.
   */
  checkCancelled?: () => void;
  /** Aborts an in-flight model call (cancellation, the caller's run deadline). */
  signal?: AbortSignal;
  /** Override the per-call output cap (tokens). */
  maxTokens?: number;
  /** Override the per-call time limit (ms). */
  callTimeoutMs?: number;
}

export interface ReviewOutcome {
  /** The reduced, GROUNDED review (findings that survived the citation gate). */
  review: Review;
  /** Human-readable grounding summary, e.g. "3/4 passed". */
  grounding: string;
  /** Findings dropped by grounding, with reasons (for logs / "never go silent"). */
  dropped: { finding: Finding; reason: string }[];
  /** Grounded findings removed by the scope filter, with reasons; empty when it is off. */
  filtered: { finding: Finding; reason: string }[];
  /**
   * Scope-filter counts: `tagged` = grounded findings carrying a `scope`;
   * `filtered` = removed; `signals` = serious out-of-scope findings kept.
   * Null when no finding carries a tag and the filter is off.
   */
  scope: { enabled: boolean; tagged: number; filtered: number; signals: number } | null;
  /** Which path ran. */
  mode: ReviewMode;
  /** Prompt assembly (for the run trace). Single-pass: the one call; map-reduce: the whole-diff assembly. */
  assembly: PromptAssembly;
  /** Per-chunk labels (for the run trace's tool_calls). */
  chunks: { label: string }[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** Joined raw model outputs (for the run trace). */
  raw: string;
}

function selectMode(strategy: ReviewStrategy, diff: UnifiedDiff, threshold: number): ReviewMode {
  if (strategy === 'single-pass') return 'single-pass';
  if (strategy === 'map-reduce') return diff.files.length > 1 ? 'map-reduce' : 'single-pass';
  // auto: map-reduce only when the diff is both large AND multi-file (else 1 call).
  const totalLines = diff.files.reduce((n, f) => n + f.additions + f.deletions, 0);
  return totalLines > threshold && diff.files.length > 1 ? 'map-reduce' : 'single-pass';
}

export async function reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome> {
  const threshold = input.mapThresholdLines ?? DEFAULT_MAP_THRESHOLD_LINES;
  const maxRetries = input.maxRetries ?? DEFAULT_REVIEW_MAX_RETRIES;
  const mode = selectMode(input.strategy ?? 'auto', input.diff, threshold);
  const emit = (kind: RunEventKind, msg: string, data?: unknown) =>
    input.onEvent?.({ kind, msg, data });

  const promptParts = {
    system: input.systemPrompt,
    skills: input.skills,
    memory: input.memory,
    specs: input.specs,
    callers: input.callers,
    repoMap: input.repoMap,
    prDescription: input.prDescription,
    intent: input.intent,
    task: input.task,
  };

  // Whole-diff assembly is the trace default; overwritten below for single-pass.
  let assembly: PromptAssembly = assemblePrompt({ ...promptParts, diff: input.diff.raw }).assembly;

  const chunks =
    mode === 'map-reduce'
      ? input.diff.files.map((f) => ({ label: f.path, diffText: sliceDiff(input.diff, f.path) }))
      : [{ label: 'all files', diffText: input.diff.raw }];

  emit(
    'info',
    mode === 'map-reduce'
      ? `Large diff → map-reduce over ${input.diff.files.length} files`
      : `Reviewing ${input.diff.files.length} changed file(s) in one pass`,
  );

  const partials: Review[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = 0;
  const raws: string[] = [];

  for (const chunk of chunks) {
    // Cancellation checkpoint — stop before the next (expensive) LLM call.
    input.checkCancelled?.();
    // 'map:' prefix only for the map-reduce path (one call per file). In
    // single-pass there is exactly one chunk (the whole diff) — don't mislabel it.
    emit(
      'tool',
      mode === 'map-reduce' ? `map: reviewing ${chunk.label}` : `Reviewing ${chunk.label} in one pass`,
      { file: chunk.label },
    );
    const a = assemblePrompt({ ...promptParts, diff: chunk.diffText });
    if (mode === 'single-pass') assembly = a.assembly;
    const res = await input.llm.completeStructured<Review>({
      model: input.model,
      schema: ReviewSchema,
      schemaName: 'Review',
      messages: a.messages,
      maxRetries,
      maxTokens: input.maxTokens ?? DEFAULT_REVIEW_MAX_TOKENS,
      timeoutMs: input.callTimeoutMs ?? DEFAULT_REVIEW_CALL_TIMEOUT_MS,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    });
    tokensIn += res.tokensIn;
    tokensOut += res.tokensOut;
    costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
    raws.push(res.raw);
    partials.push(res.data);
    emit('result', `${chunk.label}: ${res.data.findings.length} candidate finding(s)`);
  }

  const merged = reduceReviews(partials);
  emit(
    'result',
    `Reduced to ${merged.findings.length} finding(s); verdict=${merged.verdict}, score=${merged.score}`,
  );

  // SHARED citation-grounding gate (the only post-step; not duplicated per strategy).
  const ground = groundFindings(merged.findings, input.diff);
  const grounding = groundingSummary(ground);
  for (const d of ground.dropped) {
    emit('info', `grounding dropped "${d.finding.title}": ${d.reason}`);
  }
  emit('result', `Citation grounding: ${grounding}`);

  // Scope filter — once, over the merged + grounded findings, and only on request.
  // The model only tagged; what is removed is decided in code (`scope.ts`).
  const tagged = ground.kept.filter((f) => f.scope != null).length;
  let kept = ground.kept;
  let filtered: { finding: Finding; reason: string }[] = [];
  let scope: ReviewOutcome['scope'] = null;
  if (input.scopeFilter === true) {
    const result = applyScopeFilter(ground.kept);
    kept = result.kept;
    filtered = result.filtered;
    for (const d of filtered) {
      emit(
        'info',
        `scope filtered "${d.finding.title}" (${d.finding.severity}, ${d.finding.file}:${d.finding.start_line}): ${d.reason}`,
      );
    }
    emit(
      'result',
      `Scope filter: ${filtered.length} out-of-scope finding(s) filtered · ${result.signals.length} signal(s) kept`,
    );
    scope = {
      enabled: true,
      tagged,
      filtered: filtered.length,
      signals: result.signals.length,
    };
  } else if (tagged > 0) {
    scope = { enabled: false, tagged, filtered: 0, signals: 0 };
  }

  // Score is derived from the findings that SURVIVED grounding and the scope
  // filter (not the model's self-reported number, and not the pre-grounding set)
  // so the score, the findings list, and the deterministic event always agree.
  return {
    review: { ...merged, findings: kept, score: scoreFromFindings(kept) },
    grounding,
    dropped: ground.dropped,
    filtered,
    scope,
    mode,
    assembly,
    chunks: chunks.map((c) => ({ label: c.label })),
    tokensIn,
    tokensOut,
    costUsd,
    raw: raws.join('\n---\n'),
  };
}
