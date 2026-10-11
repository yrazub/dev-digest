import type {
  BlastCaller,
  BlastDegradedReason,
  BlastRadiusResponse,
  BlastTotals,
  ChangedSymbol,
  DownstreamImpact,
} from '@devdigest/shared';

/**
 * L04 — blast domain. Pure: turns the repo-intel facade's flat answer into the grouped
 * `BlastRadiusResponse`. The input shapes are declared here, structurally, because a module
 * may not import another module (`dep-no-cross-module`); `routes.ts` assigns the facade to the
 * `BlastSource` port, which is what ties the two at compile time.
 */

/** The reasons the index can state itself; `pr_files_missing` is the blast module's own. */
export type BlastIndexReason = Exclude<BlastDegradedReason, 'pr_files_missing'>;

export interface BlastSourceCaller {
  file: string;
  symbol: string;
  /** Which changed symbol this caller reaches. */
  viaSymbol: string;
  line: number;
  rank: number;
}

/** What the module reads from the facade's `getBlastRadius`. */
export interface BlastSourceResult {
  changedSymbols: ChangedSymbol[];
  callers: BlastSourceCaller[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: BlastIndexReason;
}

/** What the module reads from the facade's `getIndexState`. */
export interface BlastSourceIndexState {
  status: 'full' | 'partial' | 'degraded' | 'failed';
  lastIndexedSha: string;
  degradedReason?: BlastIndexReason;
}

export interface BlastContext {
  indexState: BlastSourceIndexState;
  repoIntelEnabled: boolean;
  callerLimit: number;
  /** The PR has no stored files, so the facade was not asked. */
  prFilesMissing: boolean;
}

export interface BlastDegradation {
  degraded: boolean;
  reason: BlastDegradedReason | null;
}

/** The empty answer used when the PR has no stored files. */
export const EMPTY_BLAST_SOURCE_RESULT: BlastSourceResult = { changedSymbols: [], callers: [] };

/** Code-unit order, so the result does not depend on the server's locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * First match wins (Q5): the PR's missing files, the flag, the index status, the facade's own
 * flag, a partial index, otherwise not degraded. The index status comes before the facade's
 * flag because on a failed index the facade falls back to the clone and answers `no_data`.
 */
export function resolveDegraded(
  result: Pick<BlastSourceResult, 'degraded' | 'reason'>,
  ctx: Pick<BlastContext, 'indexState' | 'repoIntelEnabled' | 'prFilesMissing'>,
): BlastDegradation {
  if (ctx.prFilesMissing) return { degraded: true, reason: 'pr_files_missing' };
  if (!ctx.repoIntelEnabled) return { degraded: true, reason: 'flag_off' };
  const { status, degradedReason } = ctx.indexState;
  if (status === 'degraded' || status === 'failed') {
    return { degraded: true, reason: degradedReason ?? 'index_failed' };
  }
  if (result.degraded) return { degraded: true, reason: result.reason ?? 'no_data' };
  if (status === 'partial') return { degraded: true, reason: 'index_partial' };
  return { degraded: false, reason: null };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** One sentence from the four totals; no model. */
export function buildSummary(totals: BlastTotals): string {
  if (totals.symbols === 0) return 'No symbols are declared in the changed files.';
  const symbols = plural(totals.symbols, 'changed symbol', 'changed symbols');
  if (totals.callers === 0) return `${symbols}, no downstream callers.`;
  return [
    symbols,
    plural(totals.callers, 'caller', 'callers'),
    plural(totals.endpoints, 'endpoint', 'endpoints'),
    plural(totals.crons, 'cron job', 'cron jobs'),
  ].join(', ') + '.';
}

interface RankedCaller extends BlastCaller {
  rank: number;
}

export function toBlastRadius(result: BlastSourceResult, ctx: BlastContext): BlastRadiusResponse {
  const changed_symbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));
  const changedNames = new Set(changed_symbols.map((s) => s.name));
  const declaredIn = new Set(changed_symbols.map((s) => `${s.name}\u0000${s.file}`));

  // Group by the changed symbol a caller reaches; drop the rows that cannot be callers.
  const groups = new Map<string, RankedCaller[]>();
  for (const row of result.callers) {
    if (!changedNames.has(row.viaSymbol)) continue;
    if (declaredIn.has(`${row.viaSymbol}\u0000${row.file}`)) continue;
    const list = groups.get(row.viaSymbol) ?? [];
    list.push({ name: row.symbol, file: row.file, line: row.line, rank: row.rank });
    groups.set(row.viaSymbol, list);
  }

  const facts = result.factsByFile;
  const allEndpoints = new Set<string>();
  const allCrons = new Set<string>();
  const entries: { impact: DownstreamImpact; topRank: number }[] = [];

  for (const [symbol, rows] of groups) {
    rows.sort((a, b) => b.rank - a.rank || compareText(a.file, b.file) || a.line - b.line);
    const seen = new Set<string>();
    const callers: BlastCaller[] = [];
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const row of rows) {
      const key = `${row.file}\u0000${row.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      callers.push({ name: row.name, file: row.file, line: row.line });
      const fileFacts = facts && Object.prototype.hasOwnProperty.call(facts, row.file) ? facts[row.file] : undefined;
      for (const e of fileFacts?.endpoints ?? []) endpoints.add(e);
      for (const c of fileFacts?.crons ?? []) crons.add(c);
    }
    for (const e of endpoints) allEndpoints.add(e);
    for (const c of crons) allCrons.add(c);
    entries.push({
      topRank: rows[0]?.rank ?? 0,
      impact: {
        symbol,
        callers,
        endpoints_affected: [...endpoints].sort(compareText),
        crons_affected: [...crons].sort(compareText),
      },
    });
  }

  entries.sort((a, b) => b.topRank - a.topRank || compareText(a.impact.symbol, b.impact.symbol));
  const downstream = entries.map((e) => e.impact);

  const totals: BlastTotals = {
    symbols: changed_symbols.length,
    callers: downstream.reduce((sum, d) => sum + d.callers.length, 0),
    endpoints: allEndpoints.size,
    crons: allCrons.size,
  };
  const { degraded, reason } = resolveDegraded(result, ctx);

  return {
    changed_symbols,
    downstream,
    summary: buildSummary(totals),
    totals,
    degraded,
    reason,
    indexed_sha: ctx.indexState.lastIndexedSha === '' ? null : ctx.indexState.lastIndexedSha,
    caller_limit: ctx.callerLimit,
  };
}
