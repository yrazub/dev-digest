/**
 * L01 — `findings_by_severity` / `findings_preview` on GET /repos/:id/pulls. The
 * list badges + hover popover show the breakdown and preview of a PR's latest
 * COMPLETED run — same "latest completed run" rule as cost_usd (pulls-cost.it.test.ts),
 * a newer running/failed run must not displace it, and a run with zero findings is
 * a real `{CRITICAL:0,WARNING:0,SUGGESTION:0}`/`[]`, not `null`. Gated on Docker,
 * like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

d('PR list findings_by_severity / findings_preview (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('serves the latest completed run\'s breakdown + preview, and only that run\'s', async () => {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'findings-list', fullName: 'acme/findings-list' })
      .returning();

    const prIds: Record<string, string> = {};
    for (const [number, key] of [
      [1, 'mixed'],
      [2, 'zeroFindings'],
      [3, 'noRuns'],
      [4, 'newerFailed'],
    ] as const) {
      const [pr] = await db
        .insert(t.pullRequests)
        .values({
          workspaceId,
          repoId: repo!.id,
          number,
          title: `PR ${number}`,
          author: 'marisa.koch',
          branch: `feat/${number}`,
          base: 'main',
          headSha: `sha${number}`,
          additions: 1,
          deletions: 0,
          filesCount: 1,
          status: 'open',
        })
        .returning();
      prIds[key] = pr!.id;
    }

    // PR "mixed": one completed run with findings across all three severities.
    const [mixedRun] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        prId: prIds.mixed,
        status: 'done',
        ranAt: minutesAgo(10),
        findingsCount: 3,
        findingsBySeverity: { CRITICAL: 1, WARNING: 1, SUGGESTION: 1 },
      })
      .returning();
    const [mixedReview] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: prIds.mixed, runId: mixedRun!.id, kind: 'review', score: 50 })
      .returning();
    await db.insert(t.findings).values([
      {
        reviewId: mixedReview!.id,
        file: 'src/config.ts',
        startLine: 1,
        endLine: 1,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Critical finding',
        rationale: 'r',
        confidence: 0.9,
      },
      {
        reviewId: mixedReview!.id,
        file: 'src/config.ts',
        startLine: 2,
        endLine: 2,
        severity: 'WARNING',
        category: 'bug',
        title: 'Warning finding',
        rationale: 'r',
        confidence: 0.8,
      },
      {
        reviewId: mixedReview!.id,
        file: 'src/config.ts',
        startLine: 3,
        endLine: 3,
        severity: 'SUGGESTION',
        category: 'style',
        title: 'Suggestion finding',
        rationale: 'r',
        confidence: 0.7,
      },
    ]);

    // PR "zeroFindings": a completed run with an all-zero breakdown, no findings rows.
    await db.insert(t.agentRuns).values({
      workspaceId,
      prId: prIds.zeroFindings,
      status: 'done',
      ranAt: minutesAgo(10),
      findingsCount: 0,
      findingsBySeverity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
    });

    // PR "newerFailed": an older completed run with findings, then a newer failed
    // run with no breakdown — the completed run's data must still win.
    const [olderRun] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId,
        prId: prIds.newerFailed,
        status: 'done',
        ranAt: minutesAgo(30),
        findingsCount: 1,
        findingsBySeverity: { CRITICAL: 1, WARNING: 0, SUGGESTION: 0 },
      })
      .returning();
    const [olderReview] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: prIds.newerFailed, runId: olderRun!.id, kind: 'review', score: 40 })
      .returning();
    await db.insert(t.findings).values({
      reviewId: olderReview!.id,
      file: 'src/config.ts',
      startLine: 1,
      endLine: 1,
      severity: 'CRITICAL',
      category: 'security',
      title: 'Still-latest-completed finding',
      rationale: 'r',
      confidence: 0.9,
    });
    await db.insert(t.agentRuns).values({
      workspaceId,
      prId: prIds.newerFailed,
      status: 'failed',
      ranAt: minutesAgo(5),
      findingsCount: 0,
    });

    const app = await buildApp({
      config: config(),
      db,
      overrides: { github: new MockGitHubClient({ pulls: [] }) },
    });
    const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const byId = new Map((res.json() as PrMeta[]).map((p) => [p.id, p]));

    const mixed = byId.get(prIds.mixed)!;
    expect(mixed.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });
    expect(mixed.findings_preview).toHaveLength(3);
    expect(new Set(mixed.findings_preview!.map((f) => f.severity))).toEqual(
      new Set(['CRITICAL', 'WARNING', 'SUGGESTION']),
    );

    const zero = byId.get(prIds.zeroFindings)!;
    expect(zero.findings_by_severity).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(zero.findings_preview).toEqual([]);

    const noRuns = byId.get(prIds.noRuns)!;
    expect(noRuns.findings_by_severity).toBeNull();
    expect(noRuns.findings_preview).toEqual([]);

    const newerFailed = byId.get(prIds.newerFailed)!;
    expect(newerFailed.findings_by_severity).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
    expect(newerFailed.findings_preview).toHaveLength(1);
    expect(newerFailed.findings_preview![0]!.title).toBe('Still-latest-completed finding');

    await app.close();
  });
});
