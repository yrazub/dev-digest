import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { getTableConfig, type AnyPgColumn, type AnyPgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { EvalCaseResult, EvalExpectation, EvalSkillRef } from '@devdigest/shared';
import type { EvalSuiteRun, EvalSuiteRunDetail } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { outcomeOf } from '../domain.js';
import type { EvalResultRow, EvalRunFinish, EvalStoredResult, NewEvalRun } from '../ports.js';

/**
 * Eval run reads and writes: `eval_suite_runs` (one row per run) and `eval_runs` (one row per case
 * result). JSON columns (`skills`, `actual_output`, `expected_output`) are parsed with their
 * contracts when a row is read.
 */

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

const SkillRefs = z.array(EvalSkillRef);
const ActualOutput = EvalCaseResult.shape.actual_output;

/** The constraint name drizzle generated for the foreign key on `column` — never a guessed literal. */
function foreignKeyName(table: AnyPgTable, column: AnyPgColumn): string | undefined {
  const fk = getTableConfig(table).foreignKeys.find((f) =>
    f.reference().columns.some((c) => c.name === column.name),
  );
  return fk?.getName();
}

const CASE_FK = foreignKeyName(t.evalRuns, t.evalRuns.caseId);
const RUN_FK = foreignKeyName(t.evalRuns, t.evalRuns.suiteRunId);

/** `code` and `constraint_name` of a postgres-js error, when it is one. */
function pgError(err: unknown): { code?: string; constraint?: string } {
  if (typeof err !== 'object' || err === null) return {};
  const e = err as { code?: unknown; constraint_name?: unknown };
  return {
    code: typeof e.code === 'string' ? e.code : undefined,
    constraint: typeof e.constraint_name === 'string' ? e.constraint_name : undefined,
  };
}

const runColumns = {
  id: t.evalSuiteRuns.id,
  agentId: t.evalSuiteRuns.agentId,
  agentName: t.agents.name,
  status: t.evalSuiteRuns.status,
  agentVersion: t.evalSuiteRuns.agentVersion,
  systemPrompt: t.evalSuiteRuns.systemPrompt,
  provider: t.evalSuiteRuns.provider,
  model: t.evalSuiteRuns.model,
  strategy: t.evalSuiteRuns.strategy,
  skills: t.evalSuiteRuns.skills,
  recall: t.evalSuiteRuns.recall,
  precision: t.evalSuiteRuns.precision,
  citationAccuracy: t.evalSuiteRuns.citationAccuracy,
  casesTotal: t.evalSuiteRuns.casesTotal,
  casesDone: t.evalSuiteRuns.casesDone,
  casesPassed: t.evalSuiteRuns.casesPassed,
  casesErrored: t.evalSuiteRuns.casesErrored,
  costUsd: t.evalSuiteRuns.costUsd,
  startedAt: t.evalSuiteRuns.startedAt,
  finishedAt: t.evalSuiteRuns.finishedAt,
  error: t.evalSuiteRuns.error,
};

interface RunRow {
  id: string;
  agentId: string;
  agentName: string;
  status: EvalSuiteRun['status'];
  agentVersion: number;
  systemPrompt: string;
  provider: EvalSuiteRun['config']['provider'];
  model: string;
  strategy: EvalSuiteRun['config']['strategy'];
  skills: unknown;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  casesTotal: number;
  casesDone: number;
  casesPassed: number;
  casesErrored: number;
  costUsd: number | null;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
}

function toRun(row: RunRow): EvalSuiteRun {
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_name: row.agentName,
    status: row.status,
    config: {
      agent_version: row.agentVersion,
      system_prompt: row.systemPrompt,
      provider: row.provider,
      model: row.model,
      strategy: row.strategy,
      skills: SkillRefs.parse(row.skills),
    },
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    cases_total: row.casesTotal,
    cases_done: row.casesDone,
    cases_passed: row.casesPassed,
    cases_errored: row.casesErrored,
    cost_usd: row.costUsd,
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
    error: row.error,
  };
}

async function readRun(db: Db, workspaceId: string, runId: string): Promise<EvalSuiteRun | undefined> {
  const [row] = await db
    .select(runColumns)
    .from(t.evalSuiteRuns)
    .innerJoin(t.agents, eq(t.agents.id, t.evalSuiteRuns.agentId))
    .where(and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.id, runId)));
  return row ? toRun(row) : undefined;
}

export async function hasRunningRun(db: Db, agentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: t.evalSuiteRuns.id })
    .from(t.evalSuiteRuns)
    .where(and(eq(t.evalSuiteRuns.agentId, agentId), eq(t.evalSuiteRuns.status, 'running')))
    .limit(1);
  return row !== undefined;
}

/** The partial unique index on `(agent_id) where status = 'running'` turns a second run into `'conflict'`. */
export async function insertRun(db: Db, values: NewEvalRun): Promise<EvalSuiteRun | 'conflict'> {
  const { config } = values;
  let id: string;
  try {
    const [row] = await db
      .insert(t.evalSuiteRuns)
      .values({
        workspaceId: values.workspaceId,
        agentId: values.agentId,
        agentVersion: config.agent_version,
        systemPrompt: config.system_prompt,
        provider: config.provider,
        model: config.model,
        strategy: config.strategy,
        skills: config.skills,
        status: 'running',
        casesTotal: values.casesTotal,
      })
      .returning({ id: t.evalSuiteRuns.id });
    id = row!.id;
  } catch (err) {
    if (pgError(err).code === UNIQUE_VIOLATION) return 'conflict';
    throw err;
  }
  const run = await readRun(db, values.workspaceId, id);
  if (!run) throw new Error('Eval run vanished right after insert');
  return run;
}

/**
 * Insert the case's result and bump the run's `cases_done` in one transaction (R-SRV-39).
 * A foreign-key violation says which parent is gone; the constraint name decides.
 */
export async function storeResult(
  db: Db,
  runId: string,
  row: EvalResultRow,
): Promise<'stored' | 'case_gone' | 'run_gone'> {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(t.evalRuns).values({
        caseId: row.caseId,
        suiteRunId: runId,
        actualOutput: row.actualOutput,
        pass: row.pass,
        recall: row.recall,
        precision: row.precision,
        citationAccuracy: row.citationAccuracy,
        durationMs: row.durationMs,
        costUsd: row.costUsd,
        error: row.error,
      });
      await tx
        .update(t.evalSuiteRuns)
        .set({ casesDone: sql`${t.evalSuiteRuns.casesDone} + 1` })
        .where(eq(t.evalSuiteRuns.id, runId));
    });
    return 'stored';
  } catch (err) {
    const { code, constraint } = pgError(err);
    if (code === FOREIGN_KEY_VIOLATION) {
      if (constraint !== undefined && constraint === CASE_FK) return 'case_gone';
      if (constraint !== undefined && constraint === RUN_FK) return 'run_gone';
    }
    throw err;
  }
}

/** The run's stored results with each case's kind, oldest first. */
export async function resultsOf(db: Db, runId: string): Promise<EvalStoredResult[]> {
  const rows = await db
    .select({
      caseId: t.evalRuns.caseId,
      expected: t.evalCases.expectedOutput,
      error: t.evalRuns.error,
      pass: t.evalRuns.pass,
      actualOutput: t.evalRuns.actualOutput,
      costUsd: t.evalRuns.costUsd,
    })
    .from(t.evalRuns)
    .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
    .where(eq(t.evalRuns.suiteRunId, runId))
    .orderBy(asc(t.evalRuns.ranAt), asc(t.evalRuns.id));
  return rows.map((r) => ({
    case_id: r.caseId,
    kind: EvalExpectation.parse(r.expected).kind,
    error: r.error,
    pass: r.pass,
    actual_output: ActualOutput.parse(r.actualOutput),
    cost_usd: r.costUsd,
  }));
}

/** Set the end state of a run. `false` when the run row is gone. */
export async function finishRun(db: Db, runId: string, finish: EvalRunFinish): Promise<boolean> {
  const end =
    'failed' in finish
      ? {
          status: 'failed' as const,
          error: finish.failed,
          ...(finish.cases_errored === undefined ? {} : { casesErrored: finish.cases_errored }),
        }
      : {
          status: 'done' as const,
          recall: finish.recall,
          precision: finish.precision,
          citationAccuracy: finish.citation_accuracy,
          casesPassed: finish.cases_passed,
          casesErrored: finish.cases_errored,
          costUsd: finish.cost_usd,
        };
  const rows = await db
    .update(t.evalSuiteRuns)
    .set({ ...end, finishedAt: new Date() })
    .where(eq(t.evalSuiteRuns.id, runId))
    .returning({ id: t.evalSuiteRuns.id });
  return rows.length > 0;
}

export async function listRuns(
  db: Db,
  workspaceId: string,
  agentId: string,
  limit: number,
  offset: number,
): Promise<{ runs: EvalSuiteRun[]; total: number }> {
  const scope = and(eq(t.evalSuiteRuns.workspaceId, workspaceId), eq(t.evalSuiteRuns.agentId, agentId));
  const rows = await db
    .select(runColumns)
    .from(t.evalSuiteRuns)
    .innerJoin(t.agents, eq(t.agents.id, t.evalSuiteRuns.agentId))
    .where(scope)
    .orderBy(desc(t.evalSuiteRuns.startedAt), desc(t.evalSuiteRuns.id))
    .limit(limit)
    .offset(offset);
  const [total] = await db.select({ n: count() }).from(t.evalSuiteRuns).where(scope);
  return { runs: rows.map(toRun), total: total?.n ?? 0 };
}

/** The run with one result per stored row, ordered by case name (R-SRV-40). */
export async function runDetail(
  db: Db,
  workspaceId: string,
  runId: string,
): Promise<EvalSuiteRunDetail | undefined> {
  const run = await readRun(db, workspaceId, runId);
  if (!run) return undefined;
  const rows = await db
    .select({
      id: t.evalRuns.id,
      caseId: t.evalRuns.caseId,
      caseName: t.evalCases.name,
      expected: t.evalCases.expectedOutput,
      ranAt: t.evalRuns.ranAt,
      actualOutput: t.evalRuns.actualOutput,
      pass: t.evalRuns.pass,
      recall: t.evalRuns.recall,
      precision: t.evalRuns.precision,
      citationAccuracy: t.evalRuns.citationAccuracy,
      durationMs: t.evalRuns.durationMs,
      costUsd: t.evalRuns.costUsd,
      error: t.evalRuns.error,
    })
    .from(t.evalRuns)
    .innerJoin(t.evalCases, eq(t.evalCases.id, t.evalRuns.caseId))
    .where(eq(t.evalRuns.suiteRunId, runId))
    .orderBy(asc(t.evalCases.name), asc(t.evalRuns.id));
  const results: EvalCaseResult[] = rows.map((r) => {
    const expectation = EvalExpectation.parse(r.expected);
    return {
      id: r.id,
      case_id: r.caseId,
      suite_run_id: runId,
      case_name: r.caseName,
      kind: expectation.kind,
      expectation,
      outcome: outcomeOf({ error: r.error, pass: r.pass }),
      ran_at: r.ranAt.toISOString(),
      actual_output: ActualOutput.parse(r.actualOutput),
      pass: r.pass,
      recall: r.recall,
      precision: r.precision,
      citation_accuracy: r.citationAccuracy,
      duration_ms: r.durationMs,
      cost_usd: r.costUsd,
      error: r.error,
    };
  });
  return { ...run, results };
}

/** Boot reap: every `running` run is orphaned by the dead process (R-SRV-33). */
export async function reapRunning(db: Db): Promise<number> {
  const rows = await db
    .update(t.evalSuiteRuns)
    .set({ status: 'failed', error: 'Interrupted by server restart', finishedAt: new Date() })
    .where(eq(t.evalSuiteRuns.status, 'running'))
    .returning({ id: t.evalSuiteRuns.id });
  return rows.length;
}
