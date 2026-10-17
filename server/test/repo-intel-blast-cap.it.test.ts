/**
 * L04 Q2 / B6 — the caller cap applies per changed symbol, not over the flat list.
 *
 * `getBlastRadius` used to `slice(0, MAX_CALLERS_PER_SYMBOL)` the whole rank-sorted
 * caller list, so one hot symbol could push every caller of its sibling out. The
 * cap is now applied per `viaSymbol`, keeping each symbol's highest-ranked callers.
 *
 * Fixture facts this test depends on (specs/plans/L04-blast-radius.md, phase 2):
 *  - a reference counts only when `decl_file` is the changed file and its `from_path`
 *    has a `file_rank` row (inner join in `RepoIntelRepository.getResolvedCallers`);
 *  - callers are de-duplicated by file + enclosing symbol + target, so the 25 + 5
 *    references come from 30 different files with distinct ranks.
 *
 * Every caller of the hot symbol outranks every caller of the cool one, so the old
 * flat cap would have returned 20 + 0.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { MAX_CALLERS_PER_SYMBOL, INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const CHANGED_FILE = 'src/lib/shared.ts';
const HOT = 'hotFn';
const COOL = 'coolFn';
const HOT_CALLERS = 25;
const COOL_CALLERS = 5;

const hotFile = (i: number) => `src/hot/caller-${String(i).padStart(2, '0')}.ts`;
const coolFile = (i: number) => `src/cool/caller-${String(i).padStart(2, '0')}.ts`;
// Ranks grow with the index: hot callers 1..25, cool callers 0.01..0.05 (all below the hot ones).
const hotRank = (i: number) => i + 1;
const coolRank = (i: number) => (i + 1) / 100;

d('repo-intel getBlastRadius: the caller cap is per changed symbol', () => {
  let pg: PgFixture;
  let repoId: string;
  let svc: RepoIntelService;

  beforeAll(async () => {
    pg = await startPg();
    const db = pg.handle.db;
    await seed(db);
    const [ws] = await db.select().from(t.workspaces);
    const [r] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'cap', fullName: 'acme/cap' })
      .returning();
    repoId = r!.id;

    await db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: 'abc123',
      indexerVersion: INDEXER_VERSION,
      status: 'full',
    });

    // Two symbols declared in the one changed file.
    await db.insert(t.symbols).values([
      { repoId, path: CHANGED_FILE, name: HOT, kind: 'function', line: 1, endLine: 5, exported: true },
      { repoId, path: CHANGED_FILE, name: COOL, kind: 'function', line: 10, endLine: 15, exported: true },
    ]);

    // One caller file per reference, each with its own rank. Inserted in ascending
    // rank order, so a cap that kept "the first N inserted" would keep the wrong ones.
    const files = [
      ...Array.from({ length: HOT_CALLERS }, (_, i) => ({ path: hotFile(i), rank: hotRank(i) })),
      ...Array.from({ length: COOL_CALLERS }, (_, i) => ({ path: coolFile(i), rank: coolRank(i) })),
    ];
    await db.insert(t.fileRank).values(
      files.map((f) => ({
        repoId,
        filePath: f.path,
        pagerank: f.rank,
        hotness: 0,
        rank: f.rank,
        percentile: 50,
      })),
    );
    await db.insert(t.references).values([
      ...Array.from({ length: HOT_CALLERS }, (_, i) => ({
        repoId,
        fromPath: hotFile(i),
        toSymbol: HOT,
        line: 3,
        declFile: CHANGED_FILE,
      })),
      ...Array.from({ length: COOL_CALLERS }, (_, i) => ({
        repoId,
        fromPath: coolFile(i),
        toSymbol: COOL,
        line: 3,
        declFile: CHANGED_FILE,
      })),
    ]);

    // The persistent path reads only `config.repoIntelEnabled` and `db`; with a `full`
    // index row the ripgrep fallback (codeIndex) is never reached.
    const container = { config: { repoIntelEnabled: true }, db } as never;
    svc = new RepoIntelService(container);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  it('returns 20 callers of the hot symbol and all 5 of its sibling, highest rank kept', async () => {
    expect(MAX_CALLERS_PER_SYMBOL).toBe(20);

    const blast = await svc.getBlastRadius(repoId, [CHANGED_FILE]);

    expect(blast.degraded).toBe(false);
    expect(blast.changedSymbols.map((s) => s.name).sort()).toEqual([COOL, HOT]);

    const hot = blast.callers.filter((c) => c.viaSymbol === HOT);
    const cool = blast.callers.filter((c) => c.viaSymbol === COOL);
    expect(hot).toHaveLength(20);
    expect(cool).toHaveLength(5);
    expect(blast.callers).toHaveLength(25);

    // The 20 kept are the highest-ranked: files 5..24 (ranks 6..25); files 0..4 are dropped.
    const expectedHot = Array.from({ length: 20 }, (_, i) => hotFile(i + 5)).sort();
    expect(hot.map((c) => c.file).sort()).toEqual(expectedHot);
    expect(Math.min(...hot.map((c) => c.rank))).toBe(6);

    // The sibling keeps every caller.
    expect(cool.map((c) => c.file).sort()).toEqual(
      Array.from({ length: COOL_CALLERS }, (_, i) => coolFile(i)),
    );

    // The overall order stays rank-descending.
    const ranks = blast.callers.map((c) => c.rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));
  });
});
