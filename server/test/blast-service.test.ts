/**
 * L04 — `BlastService.forPull` (`modules/blast/service.ts`) with hand-written fakes for its three ports
 * (`BlastStore`, `BlastSource`, `BlastLog`). Hermetic: no database, no app. It pins how the service
 * drives the facade (one `getBlastRadius`, one `getIndexState`, none when the PR has no files), what it
 * throws for an unknown PR, the `caller_limit` it states and the one log line it writes.
 * Spec: `server/specs/L04-blast-radius.md` ("Service"); plan: `specs/L04-blast-radius-plan.md` (phase 3).
 */
import { describe, it, expect } from 'vitest';
import { BlastRadiusResponse } from '@devdigest/shared';
import { BlastService } from '../src/modules/blast/service.js';
import type { BlastSourceIndexState, BlastSourceResult } from '../src/modules/blast/domain.js';
import type { BlastLog, BlastSource, BlastStore } from '../src/modules/blast/ports.js';
import { NotFoundError } from '../src/platform/errors.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';

const WORKSPACE = 'ws-1';
const PR = 'pr-1';
const REPO = 'repo-1';
const PATHS = ['src/auth/session.ts', 'src/middleware/ratelimit.ts'];

const FACADE: BlastSourceResult = {
  changedSymbols: [{ name: 'rateLimit', file: 'src/middleware/ratelimit.ts', kind: 'function' }],
  callers: [
    { file: 'src/api/public/index.ts', symbol: 'publicRouter', viaSymbol: 'rateLimit', line: 23, rank: 0.5 },
    { file: 'src/jobs/reset-buckets.ts', symbol: 'resetBuckets', viaSymbol: 'rateLimit', line: 8, rank: 0.2 },
  ],
  factsByFile: {
    'src/api/public/index.ts': { endpoints: ['GET /api/public/items'], crons: [] },
    'src/jobs/reset-buckets.ts': { endpoints: [], crons: ['reset-rate-buckets (hourly)'] },
  },
  degraded: false,
};
const FULL: BlastSourceIndexState = { status: 'full', lastIndexedSha: 'abc123' };

interface Harness {
  service: BlastService;
  store: { findPull: [string, string][]; changedPaths: string[] };
  source: { getBlastRadius: [string, string[]][]; getIndexState: string[] };
  logs: { fields: Record<string, unknown>; message: string }[];
  log: BlastLog;
}

function harness(opts: {
  pull?: { id: string; repoId: string } | undefined;
  paths?: string[];
  result?: BlastSourceResult;
  indexState?: BlastSourceIndexState;
  repoIntelEnabled?: boolean;
  callerLimit?: number;
} = {}): Harness {
  const pull = 'pull' in opts ? opts.pull : { id: PR, repoId: REPO };
  const calls: Harness['store'] = { findPull: [], changedPaths: [] };
  const sourceCalls: Harness['source'] = { getBlastRadius: [], getIndexState: [] };
  const logs: Harness['logs'] = [];

  const store: BlastStore = {
    async findPull(workspaceId, prId) {
      calls.findPull.push([workspaceId, prId]);
      return pull;
    },
    async changedPaths(prId) {
      calls.changedPaths.push(prId);
      return opts.paths ?? PATHS;
    },
  };
  const source: BlastSource = {
    async getBlastRadius(repoId, changedFiles) {
      sourceCalls.getBlastRadius.push([repoId, changedFiles]);
      return opts.result ?? FACADE;
    },
    async getIndexState(repoId) {
      sourceCalls.getIndexState.push(repoId);
      return opts.indexState ?? FULL;
    },
  };
  const log: BlastLog = { info: (fields, message) => logs.push({ fields, message }) };
  const service = new BlastService({
    store,
    source,
    repoIntelEnabled: opts.repoIntelEnabled ?? true,
    callerLimit: opts.callerLimit ?? MAX_CALLERS_PER_SYMBOL,
  });
  return { service, store: calls, source: sourceCalls, logs, log };
}

describe('BlastService.forPull — the facade calls', () => {
  it('calls getBlastRadius once with the PR\'s repo and paths, and getIndexState once', async () => {
    const h = harness();
    const res = await h.service.forPull(WORKSPACE, PR, h.log);

    expect(h.store.findPull).toEqual([[WORKSPACE, PR]]);
    expect(h.source.getBlastRadius).toEqual([[REPO, PATHS]]);
    expect(h.source.getIndexState).toEqual([REPO]);
    expect(BlastRadiusResponse.safeParse(res).success).toBe(true);
    expect(res.degraded).toBe(false);
    expect(res.reason).toBeNull();
    expect(res.downstream.map((d) => d.symbol)).toEqual(['rateLimit']);
    expect(res.indexed_sha).toBe('abc123');
  });

  it('does not call getBlastRadius when the PR has no stored paths, and answers pr_files_missing', async () => {
    const h = harness({ paths: [] });
    const res = await h.service.forPull(WORKSPACE, PR, h.log);

    expect(h.source.getBlastRadius).toEqual([]);
    expect(h.source.getIndexState).toEqual([REPO]);
    expect(res.degraded).toBe(true);
    expect(res.reason).toBe('pr_files_missing');
    expect(res.changed_symbols).toEqual([]);
    expect(res.downstream).toEqual([]);
    expect(res.totals).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0, symbols_without_callers: 0 });
    expect(res.indexed_sha).toBe('abc123');
  });

  it('answers flag_off when the service is built with the flag off', async () => {
    const h = harness({ repoIntelEnabled: false });
    const res = await h.service.forPull(WORKSPACE, PR, h.log);
    expect(res.degraded).toBe(true);
    expect(res.reason).toBe('flag_off');
  });
});

describe('BlastService.forPull — an unknown PR', () => {
  it('rejects with NotFoundError and touches neither the paths nor the facade', async () => {
    const h = harness({ pull: undefined });

    const err = await h.service.forPull(WORKSPACE, 'missing', h.log).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as NotFoundError).code).toBe('not_found');
    expect(h.store.changedPaths).toEqual([]);
    expect(h.source.getBlastRadius).toEqual([]);
    expect(h.source.getIndexState).toEqual([]);
    expect(h.logs).toEqual([]);
  });
});

describe('BlastService.forPull — caller_limit (B6)', () => {
  it('states MAX_CALLERS_PER_SYMBOL when the service is given that constant', async () => {
    const h = harness({ callerLimit: MAX_CALLERS_PER_SYMBOL });
    const res = await h.service.forPull(WORKSPACE, PR, h.log);
    expect(res.caller_limit).toBe(MAX_CALLERS_PER_SYMBOL);
  });

  it('states the limit it was built with', async () => {
    const h = harness({ callerLimit: 3 });
    const res = await h.service.forPull(WORKSPACE, PR, h.log);
    expect(res.caller_limit).toBe(3);
  });
});

describe('BlastService.forPull — the log line (B1)', () => {
  it('writes exactly one info line with the twelve keys and the stated message', async () => {
    const h = harness();
    await h.service.forPull(WORKSPACE, PR, h.log);

    expect(h.logs).toHaveLength(1);
    const { fields, message } = h.logs[0]!;
    expect(message).toBe('blast: served from the repo-intel index');
    expect(Object.keys(fields).sort()).toEqual(
      [
        'callers',
        'crons',
        'degraded',
        'endpoints',
        'files',
        'indexStatus',
        'indexedSha',
        'ms',
        'prId',
        'reason',
        'repoId',
        'symbols',
      ].sort(),
    );
  });

  it('carries the ids, the counts and the index status', async () => {
    const h = harness();
    await h.service.forPull(WORKSPACE, PR, h.log);
    const { fields } = h.logs[0]!;

    expect(fields).toMatchObject({
      prId: PR,
      repoId: REPO,
      files: PATHS.length,
      symbols: 1,
      callers: 2,
      endpoints: 1,
      crons: 1,
      degraded: false,
      reason: null,
      indexStatus: 'full',
      indexedSha: 'abc123',
    });
    expect(typeof fields.ms).toBe('number');
    expect(fields.ms as number).toBeGreaterThanOrEqual(0);
  });

  it('contains no path and no symbol name in any value', async () => {
    const h = harness();
    await h.service.forPull(WORKSPACE, PR, h.log);

    const line = JSON.stringify(h.logs[0]);
    for (const path of [...PATHS, ...FACADE.callers.map((c) => c.file)]) expect(line).not.toContain(path);
    for (const name of ['rateLimit', 'publicRouter', 'resetBuckets', 'GET /api/public/items', 'reset-rate-buckets']) {
      expect(line).not.toContain(name);
    }
    for (const value of Object.values(h.logs[0]!.fields)) {
      if (typeof value === 'string') expect(value).not.toMatch(/\.(ts|tsx|js)$/);
    }
  });

  it('still writes one line, with the reason, when the PR has no stored paths', async () => {
    const h = harness({ paths: [] });
    await h.service.forPull(WORKSPACE, PR, h.log);

    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]!.fields).toMatchObject({ files: 0, symbols: 0, callers: 0, degraded: true, reason: 'pr_files_missing' });
  });
});
