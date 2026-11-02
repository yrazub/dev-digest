import { and, asc, count, desc, eq, lte, sql } from 'drizzle-orm';
import type { EvalAgentOverview, EvalOverview } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { RECALL_TREND_POINTS, RECENT_RUNS } from '../constants.js';
import { runColumns, toRun } from './run.repo.js';

/**
 * The dashboard read: every agent of the workspace with its latest done run, running flag, counts
 * and recall trend, plus the newest runs of the workspace (R-SRV-41). Every query is scoped by
 * `workspace_id`; the per-agent figures are grouped reads, not one query per agent.
 */
export async function overview(db: Db, workspaceId: string): Promise<EvalOverview> {
  const agents = await db
    .select({
      id: t.agents.id,
      name: t.agents.name,
      provider: t.agents.provider,
      model: t.agents.model,
      enabled: t.agents.enabled,
    })
    .from(t.agents)
    .where(eq(t.agents.workspaceId, workspaceId))
    .orderBy(asc(t.agents.name), asc(t.agents.id));

  const caseCounts = await db
    .select({ agentId: t.evalCases.ownerId, n: count() })
    .from(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
    .groupBy(t.evalCases.ownerId);

  const runCounts = await db
    .select({ agentId: t.evalSuiteRuns.agentId, n: count() })
    .from(t.evalSuiteRuns)
    .where(eq(t.evalSuiteRuns.workspaceId, workspaceId))
    .groupBy(t.evalSuiteRuns.agentId);

  const runningRows = await db
    .select({ agentId: t.evalSuiteRuns.agentId })
    .from(t.evalSuiteRuns)
    .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.status, 'running')));

  const latestRows = await db
    .selectDistinctOn([t.evalSuiteRuns.agentId], runColumns)
    .from(t.evalSuiteRuns)
    .innerJoin(t.agents, eq(t.agents.id, t.evalSuiteRuns.agentId))
    .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.status, 'done')))
    .orderBy(t.evalSuiteRuns.agentId, desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id));

  const ranked = db
    .select({
      agentId: t.evalSuiteRuns.agentId,
      recall: t.evalSuiteRuns.recall,
      startedAt: t.evalSuiteRuns.startedAt,
      rank: sql<number>`row_number() over (partition by ${t.evalSuiteRuns.agentId} order by ${t.evalSuiteRuns.startedAt} desc, ${t.evalSuiteRuns.id} desc)`.as(
        'rank',
      ),
    })
    .from(t.evalSuiteRuns)
    .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.status, 'done')))
    .as('ranked');
  const trendRows = await db
    .select({ agentId: ranked.agentId, recall: ranked.recall })
    .from(ranked)
    .where(lte(ranked.rank, RECALL_TREND_POINTS))
    .orderBy(asc(ranked.agentId), asc(ranked.startedAt));

  const recentRows = await db
    .select(runColumns)
    .from(t.evalSuiteRuns)
    .innerJoin(t.agents, eq(t.agents.id, t.evalSuiteRuns.agentId))
    .where(eq(t.evalSuiteRuns.workspaceId, workspaceId))
    .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id))
    .limit(RECENT_RUNS);

  const casesOf = new Map(caseCounts.map((r) => [r.agentId, r.n]));
  const runsOf = new Map(runCounts.map((r) => [r.agentId, r.n]));
  const running = new Set(runningRows.map((r) => r.agentId));
  const latestOf = new Map(latestRows.map((r) => [r.agentId, toRun(r)]));
  const trendOf = new Map<string, (number | null)[]>();
  for (const r of trendRows) {
    const points = trendOf.get(r.agentId) ?? [];
    points.push(r.recall);
    trendOf.set(r.agentId, points);
  }

  return {
    agents: agents.map(
      (a): EvalAgentOverview => ({
        agent_id: a.id,
        agent_name: a.name,
        provider: a.provider,
        model: a.model,
        enabled: a.enabled,
        cases_total: casesOf.get(a.id) ?? 0,
        runs_total: runsOf.get(a.id) ?? 0,
        running: running.has(a.id),
        latest: latestOf.get(a.id) ?? null,
        recall_trend: trendOf.get(a.id) ?? [],
      }),
    ),
    recent_runs: recentRows.map(toRun),
  };
}
