/**
 * L04 — `GET /pulls/:id/blast` against a real Postgres and the built app (`app.inject`), through the
 * real facade (`RepoIntelService`) and the real wiring of `caller_limit`. Every repo, PR and index row
 * is inserted by the test (repos without a clone path, so a failed or degraded index cannot fall back to
 * a clone and the map is empty). The outside world is replaced through `overrides`: an empty
 * `MockSecretsProvider` (so `~/.devdigest/secrets.json` is never read), a GitHub double and a
 * `MockLLMProvider`, each wrapped in a recording `Proxy`. The route reads Postgres only (B4), so after
 * all requests neither may have recorded a call. No test calls `GET /pulls/:id`: with the GitHub mock it
 * would replace a PR's `pr_files`. `changed_symbols` is compared as a set: the facade reads symbols
 * without `ORDER BY`.
 * Spec: `server/specs/L04-blast-radius.md`; degraded order: `specs/L04-blast-radius.md` (Q5);
 * plan: `specs/L04-blast-radius-plan.md` (phase 3).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { count } from 'drizzle-orm';
import { BlastRadius, BlastRadiusResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { MAX_CALLERS_PER_SYMBOL, INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = (env: Record<string, string> = {}) =>
  loadConfig({ ...process.env, NODE_ENV: 'test', ...env } as NodeJS.ProcessEnv);

/** A double whose every method call, of any method, is recorded by name. */
function recording<T extends object>(inner: T) {
  const calls: string[] = [];
  const proxy = new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.push(String(prop));
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { proxy, calls };
}

// ---- the fixture map -------------------------------------------------------------------------
const LIMIT = 'src/middleware/ratelimit.ts'; // declares rateLimit and bucketKey
const INDEX = 'src/api/public/index.ts'; // calls rateLimit (:23), endpoint GET /api/public/items
const HOOKS = 'src/api/public/webhooks.ts'; // calls rateLimit (:45), endpoint POST /api/public/webhooks
const RESET = 'src/jobs/reset-buckets.ts'; // calls bucketKey (:8), cron reset-rate-buckets (hourly)
const README = 'README.md'; // a changed file with no symbols
const SHA = 'f00dfeed1234';

type IndexStatus = 'full' | 'partial' | 'degraded' | 'failed';

/** A degraded-reason stub: the facade is replaced, so this is the only way to reach row 4. */
function stubRepoIntel(opts: { result: Record<string, unknown>; state: Record<string, unknown> }) {
  const calls = { getBlastRadius: [] as [string, string[]][], getIndexState: [] as string[] };
  return {
    calls,
    facade: {
      async getBlastRadius(repoId: string, files: string[]) {
        calls.getBlastRadius.push([repoId, files]);
        return opts.result;
      },
      async getIndexState(repoId: string) {
        calls.getIndexState.push(repoId);
        return opts.state;
      },
    } as never,
  };
}

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let appFlagOff: FastifyInstance;
  let workspaceId: string;
  let seq = 1;
  const gh = recording(new MockGitHubClient());
  const llm = recording(new MockLLMProvider('openrouter'));

  const buildWith = (cfg = config(), extra: Record<string, unknown> = {}) =>
    buildApp({
      config: cfg,
      db: pg.handle.db,
      overrides: { secrets: new MockSecretsProvider(), github: gh.proxy, llm: { openrouter: llm.proxy }, ...extra },
    });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildWith();
    appFlagOff = await buildWith(config({ REPO_INTEL_ENABLED: 'false' }));
  });
  afterAll(async () => {
    await app?.close();
    await appFlagOff?.close();
    await pg?.stop();
  });

  async function insertRepo(ws = workspaceId): Promise<string> {
    const n = seq++;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name: `blast-${n}`, fullName: `acme/blast-${n}` })
      .returning();
    return repo!.id;
  }

  async function insertPull(repoId: string, ws = workspaceId): Promise<string> {
    const number = 2000 + seq++;
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId,
        number,
        title: `PR ${number}`,
        author: 'marisa.koch',
        branch: `feat/${number}`,
        base: 'main',
        headSha: `sha${number}`,
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'open',
      })
      .returning();
    return pr!.id;
  }

  const insertFiles = (prId: string, paths: string[]) =>
    pg.handle.db.insert(t.prFiles).values(paths.map((path) => ({ prId, path, additions: 1, deletions: 0, patch: 'SECRET PATCH' })));

  /** The index rows of the fixture map: 2 changed symbols, 3 callers in 3 files, 2 endpoints, 1 cron. */
  async function insertIndex(repoId: string, status: IndexStatus, stats: Record<string, unknown> = {}) {
    const db = pg.handle.db;
    await db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: SHA,
      indexerVersion: INDEXER_VERSION,
      status,
      stats,
    });
    await db.insert(t.symbols).values([
      { repoId, path: LIMIT, name: 'rateLimit', kind: 'function', line: 5, endLine: 30, exported: true },
      { repoId, path: LIMIT, name: 'bucketKey', kind: 'function', line: 32, endLine: 50, exported: true },
      { repoId, path: INDEX, name: 'publicRouter', kind: 'function', line: 1, endLine: 40, exported: true },
      { repoId, path: HOOKS, name: 'webhookHandler', kind: 'function', line: 40, endLine: 60, exported: true },
      { repoId, path: RESET, name: 'resetBuckets', kind: 'function', line: 1, endLine: 20, exported: true },
    ]);
    await db.insert(t.fileRank).values(
      [
        [LIMIT, 0.9],
        [INDEX, 0.5],
        [HOOKS, 0.3],
        [RESET, 0.2],
      ].map(([filePath, rank]) => ({
        repoId,
        filePath: filePath as string,
        pagerank: rank as number,
        hotness: 0,
        rank: rank as number,
        percentile: 50,
      })),
    );
    await db.insert(t.references).values([
      { repoId, fromPath: INDEX, toSymbol: 'rateLimit', line: 23, declFile: LIMIT },
      { repoId, fromPath: HOOKS, toSymbol: 'rateLimit', line: 45, declFile: LIMIT },
      { repoId, fromPath: RESET, toSymbol: 'bucketKey', line: 8, declFile: LIMIT },
      // the declaring file calls its own symbol: the route must not report it as a caller (B5)
      { repoId, fromPath: LIMIT, toSymbol: 'bucketKey', line: 41, declFile: LIMIT },
    ]);
    await db.insert(t.fileFacts).values([
      { repoId, filePath: INDEX, endpoints: ['GET /api/public/items'], crons: [] },
      { repoId, filePath: HOOKS, endpoints: ['POST /api/public/webhooks'], crons: [] },
      { repoId, filePath: RESET, endpoints: [], crons: ['reset-rate-buckets (hourly)'] },
    ]);
  }

  /** A repo with the fixture index in the given status and a PR whose files are LIMIT and README. */
  async function indexedPull(status: IndexStatus, stats: Record<string, unknown> = {}) {
    const repoId = await insertRepo();
    await insertIndex(repoId, status, stats);
    const prId = await insertPull(repoId);
    await insertFiles(prId, [LIMIT, README]);
    return { repoId, prId };
  }

  const get = (id: string, instance: FastifyInstance = app) => instance.inject({ method: 'GET', url: `/pulls/${id}/blast` });

  async function body(id: string, instance: FastifyInstance = app): Promise<BlastRadiusResponse> {
    const res = await get(id, instance);
    expect(res.statusCode).toBe(200);
    const parsed = BlastRadiusResponse.safeParse(res.json());
    expect(parsed.success, JSON.stringify(res.json())).toBe(true);
    return parsed.data!;
  }

  const names = (b: BlastRadiusResponse) => b.changed_symbols.map((s) => s.name).sort();

  // ---- row 6: a full index ------------------------------------------------------------------
  it('answers the full map for a full index: parses as both contracts, groups, totals, not degraded', async () => {
    const { prId } = await indexedPull('full');
    const res = await get(prId);
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(BlastRadiusResponse.safeParse(json).success).toBe(true);
    expect(BlastRadius.safeParse(json).success).toBe(true);

    const b = json as BlastRadiusResponse;
    expect(names(b)).toEqual(['bucketKey', 'rateLimit']);
    expect(b.changed_symbols.every((s) => s.file === LIMIT && s.kind === 'function')).toBe(true);

    // rateLimit's best caller (0.5) outranks bucketKey's only one (0.2); the self-call in the declaring file is gone.
    expect(b.downstream).toEqual([
      {
        symbol: 'rateLimit',
        callers: [
          { name: 'publicRouter', file: INDEX, line: 23 },
          { name: 'webhookHandler', file: HOOKS, line: 45 },
        ],
        endpoints_affected: ['GET /api/public/items', 'POST /api/public/webhooks'],
        crons_affected: [],
      },
      {
        symbol: 'bucketKey',
        callers: [{ name: 'resetBuckets', file: RESET, line: 8 }],
        endpoints_affected: [],
        crons_affected: ['reset-rate-buckets (hourly)'],
      },
    ]);
    expect(b.totals).toEqual({ symbols: 2, callers: 3, endpoints: 2, crons: 1 });
    expect(b.summary).toBe('2 changed symbols, 3 callers, 2 endpoints, 1 cron job.');
    expect(b.degraded).toBe(false);
    expect(b.reason).toBeNull();
    expect(b.indexed_sha).toBe(SHA);
  });

  it('states MAX_CALLERS_PER_SYMBOL as caller_limit through the real wiring (B6)', async () => {
    const { prId } = await indexedPull('full');
    const b = await body(prId);
    expect(MAX_CALLERS_PER_SYMBOL).toBe(20);
    expect(b.caller_limit).toBe(MAX_CALLERS_PER_SYMBOL);
  });

  // ---- row 5 ---------------------------------------------------------------------------------
  it('marks a partial index index_partial and still answers the map (row 5)', async () => {
    const { prId } = await indexedPull('partial');
    const b = await body(prId);
    expect(b.degraded).toBe(true);
    expect(b.reason).toBe('index_partial');
    expect(names(b)).toEqual(['bucketKey', 'rateLimit']);
    expect(b.totals).toEqual({ symbols: 2, callers: 3, endpoints: 2, crons: 1 });
    expect(b.indexed_sha).toBe(SHA);
  });

  // ---- row 3 ---------------------------------------------------------------------------------
  it('marks a failed index index_failed with an empty map and the row\'s SHA (row 3, Q5)', async () => {
    const { prId } = await indexedPull('failed');
    const b = await body(prId);
    expect(b.degraded).toBe(true);
    expect(b.reason).toBe('index_failed');
    expect(b.changed_symbols).toEqual([]);
    expect(b.downstream).toEqual([]);
    expect(b.totals).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
    expect(b.indexed_sha).toBe(SHA);
  });

  it('names repo_too_large for a degraded index whose stats say so (row 3)', async () => {
    const { prId } = await indexedPull('degraded', { degradedReason: 'repo_too_large' });
    const b = await body(prId);
    expect(b.degraded).toBe(true);
    expect(b.reason).toBe('repo_too_large');
    expect(b.downstream).toEqual([]);
  });

  it('answers index_failed for a degraded index with no stated reason (row 3)', async () => {
    const { prId } = await indexedPull('degraded');
    const b = await body(prId);
    expect(b.reason).toBe('index_failed');
  });

  it('answers no_data and a null indexed_sha when the repo has no index row (row 3 through the synthesised state)', async () => {
    const repoId = await insertRepo();
    const prId = await insertPull(repoId);
    await insertFiles(prId, [LIMIT]);
    const b = await body(prId);
    expect(b.degraded).toBe(true);
    expect(b.reason).toBe('no_data');
    expect(b.indexed_sha).toBeNull();
    expect(b.downstream).toEqual([]);
  });

  // ---- row 1 ---------------------------------------------------------------------------------
  it('answers pr_files_missing and an empty map for a PR with no stored files (row 1)', async () => {
    const repoId = await insertRepo();
    await insertIndex(repoId, 'full');
    const prId = await insertPull(repoId);
    const b = await body(prId);
    expect(b.degraded).toBe(true);
    expect(b.reason).toBe('pr_files_missing');
    expect(b.changed_symbols).toEqual([]);
    expect(b.downstream).toEqual([]);
    expect(b.indexed_sha).toBe(SHA);
  });

  // ---- row 2 ---------------------------------------------------------------------------------
  it('answers flag_off on an app built with REPO_INTEL_ENABLED=false, even for a full index (row 2)', async () => {
    const { prId } = await indexedPull('full');
    const b = await body(prId, appFlagOff);
    expect(b.degraded).toBe(true);
    expect(b.reason).toBe('flag_off');
    expect(b.downstream).toEqual([]);
  });

  // ---- row 4 ---------------------------------------------------------------------------------
  it('answers no_data when an injected facade says degraded with no reason on a full index (row 4)', async () => {
    const repoId = await insertRepo();
    const prId = await insertPull(repoId);
    await insertFiles(prId, [LIMIT, README]);
    const stub = stubRepoIntel({
      result: { changedSymbols: [{ name: 'rateLimit', file: LIMIT, kind: 'function' }], callers: [], impactedEndpoints: [], degraded: true },
      state: { repoId, status: 'full', lastIndexedSha: SHA, indexerVersion: INDEXER_VERSION, updatedAt: new Date() },
    });
    const injected = await buildWith(config(), { repoIntel: stub.facade });
    try {
      const b = await body(prId, injected);
      expect(b.degraded).toBe(true);
      expect(b.reason).toBe('no_data');
      expect(b.changed_symbols).toEqual([{ name: 'rateLimit', file: LIMIT, kind: 'function' }]);
      expect(b.downstream).toEqual([]);
      expect(b.indexed_sha).toBe(SHA);
      // B1: one request, one facade call, with the PR's stored paths (ordered by path)
      expect(stub.calls.getBlastRadius).toEqual([[repoId, [README, LIMIT].sort()]]);
      expect(stub.calls.getIndexState).toEqual([repoId]);
    } finally {
      await injected.close();
    }
  });

  // ---- errors ----------------------------------------------------------------------------------
  it('answers 404 not_found for an unknown uuid', async () => {
    const res = await get(randomUUID());
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('answers 404 not_found for a PR that belongs to another workspace', async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-workspace' }).returning();
    const otherRepo = await insertRepo(other!.id);
    await insertIndex(otherRepo, 'full');
    const prId = await insertPull(otherRepo, other!.id);
    await insertFiles(prId, [LIMIT]);

    const res = await get(prId);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('answers 422 validation_error for an id that is not a uuid', async () => {
    const res = await get('not-a-uuid');
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
  });

  // ---- B4: read-only ---------------------------------------------------------------------------
  it('writes no row: the counts of pr_files, symbols, references, repo_index_state and agent_runs are unchanged', async () => {
    const full = await indexedPull('full');
    const failed = await indexedPull('failed');
    const bare = await insertPull(await insertRepo());

    const counts = async () => {
      const db = pg.handle.db;
      const n = async (table: Parameters<ReturnType<typeof db.select>['from']>[0]) =>
        (await db.select({ c: count() }).from(table))[0]!.c;
      return {
        prFiles: await n(t.prFiles),
        symbols: await n(t.symbols),
        references: await n(t.references),
        repoIndexState: await n(t.repoIndexState),
        agentRuns: await n(t.agentRuns),
      };
    };

    const before = await counts();
    for (const id of [full.prId, failed.prId, bare, randomUUID()]) await get(id);
    await get(full.prId, appFlagOff);
    await get('not-a-uuid');
    expect(await counts()).toEqual(before);
  });

  // Keep last: it asserts over every request the tests above made.
  it('made no GitHub call and no model call in any request (B4)', () => {
    expect(gh.calls).toEqual([]);
    expect(llm.calls).toEqual([]);
  });
});
