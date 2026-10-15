import type { BlastRadiusResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { EMPTY_BLAST_SOURCE_RESULT, toBlastRadius } from './domain.js';
import type { BlastLog, BlastSource, BlastStore } from './ports.js';

export interface BlastServiceDeps {
  store: BlastStore;
  source: BlastSource;
  repoIntelEnabled: boolean;
  callerLimit: number;
}

/**
 * L04 — blast service. Two reads of Postgres and one facade call; no GitHub, no model, no write.
 * The request logger is a parameter because a service cannot import Fastify.
 */
export class BlastService {
  constructor(private readonly deps: BlastServiceDeps) {}

  async forPull(workspaceId: string, prId: string, log: BlastLog): Promise<BlastRadiusResponse> {
    const { store, source, repoIntelEnabled, callerLimit } = this.deps;
    const startedAt = Date.now();

    const pull = await store.findPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const paths = await store.changedPaths(pull.id);
    const prFilesMissing = paths.length === 0;
    const [result, indexState] = prFilesMissing
      ? [EMPTY_BLAST_SOURCE_RESULT, await source.getIndexState(pull.repoId)]
      : await Promise.all([source.getBlastRadius(pull.repoId, paths), source.getIndexState(pull.repoId)]);

    const response = toBlastRadius(result, { indexState, repoIntelEnabled, callerLimit, prFilesMissing });

    // Counts and ids only: no path and no symbol name reaches the log.
    log.info(
      {
        prId: pull.id,
        repoId: pull.repoId,
        files: paths.length,
        symbols: response.totals.symbols,
        callers: response.totals.callers,
        endpoints: response.totals.endpoints,
        crons: response.totals.crons,
        degraded: response.degraded,
        reason: response.reason,
        indexStatus: indexState.status,
        indexedSha: response.indexed_sha,
        ms: Date.now() - startedAt,
      },
      'blast: served from the repo-intel index',
    );
    return response;
  }
}
