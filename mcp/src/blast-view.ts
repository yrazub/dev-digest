import {
  MAX_BLAST_CALLERS,
  MAX_BLAST_FACTS,
  MAX_BLAST_SYMBOLS,
  MAX_PATH,
  MAX_REPO,
  MAX_SUMMARY,
  MAX_TITLE,
} from './constants.js';
import type { ApiBlastRadius } from './ports.js';
import { cutText, sanitizeText } from './tool.js';

export interface BlastViewInput {
  /** The resolved `owner/name`. */
  repo: string;
  pr: number;
  blast: ApiBlastRadius;
}

/** The note added when any list was cut; the route's `totals` still state the full numbers. */
function cutNote(shownSymbols: number): string {
  return (
    `Showing the first ${shownSymbols} symbols and up to ${MAX_BLAST_CALLERS} callers each, highest-ranked first; ` +
    "totals count everything. The full map is on the pull request's Overview tab in DevDigest."
  );
}

/** The next step for a degraded map; the reasons are the route's, so a new one fails to compile here. */
function degradedNote(reason: NonNullable<ApiBlastRadius['reason']>, at: string): string {
  switch (reason) {
    case 'pr_files_missing':
      return `The changed files of ${at} are not stored yet. Open the pull request in the DevDigest UI once so they are imported, then call get_blast_radius again.`;
    case 'index_partial':
      return "The repository index is partial, so callers may be missing. Resync the repository in DevDigest (the Resync button on the pull request's Blast radius block) and call again for a complete map.";
    case 'index_failed':
    case 'no_data':
      return `The repository index is not available (${reason}), so this map is a best effort and may be incomplete. Resync the repository in DevDigest, then call again.`;
    case 'flag_off':
      return 'The repository index is switched off on this API (REPO_INTEL_ENABLED=false), so this map is a best effort.';
    case 'repo_too_large':
      return 'The repository is too large to index fully, so callers may be missing.';
  }
}

/**
 * The blast-radius result: the route's map in a compact form. Nothing is recomputed, the order and
 * the `totals` are the route's; lists are cut with a `more_*` count and every repository string is masked.
 */
export function toBlastView({ repo, pr, blast }: BlastViewInput): Record<string, unknown> {
  const repoName = cutText(repo, MAX_REPO);
  const at = `${repoName}#${pr}`;

  const declaredIn = new Map<string, string>();
  for (const symbol of blast.changed_symbols) {
    if (!declaredIn.has(symbol.name)) declaredIn.set(symbol.name, symbol.file);
  }

  let cut = blast.downstream.length > MAX_BLAST_SYMBOLS;
  const shown = blast.downstream.slice(0, MAX_BLAST_SYMBOLS);

  const impact = shown.map((entry) => {
    const declared = declaredIn.get(entry.symbol);
    const callers = entry.callers.slice(0, MAX_BLAST_CALLERS);
    const endpoints = entry.endpoints_affected.slice(0, MAX_BLAST_FACTS);
    const crons = entry.crons_affected.slice(0, MAX_BLAST_FACTS);
    const moreCallers = entry.callers.length - callers.length;
    const moreEndpoints = entry.endpoints_affected.length - endpoints.length;
    const moreCrons = entry.crons_affected.length - crons.length;
    if (moreCallers > 0 || moreEndpoints > 0 || moreCrons > 0) cut = true;

    return {
      symbol: sanitizeText(entry.symbol, MAX_TITLE),
      ...(declared === undefined ? {} : { declared_in: sanitizeText(declared, MAX_PATH) }),
      callers: callers.map(
        (caller) => `${sanitizeText(caller.file, MAX_PATH)}:${caller.line} ${sanitizeText(caller.name, MAX_TITLE)}`,
      ),
      ...(moreCallers > 0 ? { more_callers: moreCallers } : {}),
      endpoints: endpoints.map((endpoint) => sanitizeText(endpoint, MAX_TITLE)),
      ...(moreEndpoints > 0 ? { more_endpoints: moreEndpoints } : {}),
      crons: crons.map((cron) => sanitizeText(cron, MAX_TITLE)),
      ...(moreCrons > 0 ? { more_crons: moreCrons } : {}),
    };
  });

  const withoutCallers = blast.totals.symbols_without_callers;

  const notes: string[] = [];
  if (blast.degraded && blast.reason !== null) {
    notes.push(degradedNote(blast.reason, at));
  } else if (blast.changed_symbols.length === 0) {
    notes.push(`No symbols are declared in the changed files of ${at}, so there is nothing to map.`);
  } else if (blast.downstream.length === 0) {
    notes.push('Nothing in the indexed repository references the changed symbols.');
  }
  if (cut) notes.push(cutNote(shown.length));

  return {
    repo: repoName,
    pr,
    summary: cutText(blast.summary, MAX_SUMMARY),
    totals: {
      symbols: blast.totals.symbols,
      callers: blast.totals.callers,
      endpoints: blast.totals.endpoints,
      crons: blast.totals.crons,
    },
    impact,
    ...(blast.downstream.length > shown.length ? { more_symbols: blast.downstream.length - shown.length } : {}),
    ...(withoutCallers > 0 ? { symbols_without_callers: withoutCallers } : {}),
    ...(blast.degraded ? { degraded: true, reason: blast.reason } : {}),
    ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
  };
}
