import { and, asc, count, desc, eq } from 'drizzle-orm';
import { EvalCaseMeta, EvalExpectation } from '@devdigest/shared';
import type { EvalCaseRecord } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { NewEvalCase } from '../ports.js';

/**
 * Eval case reads and writes. `expected_output` and `input_meta` hold contract shapes the
 * database does not enforce, so they are parsed when a row is read. There is no update: a stored
 * case is never changed (R-SRV-10).
 */

type CaseRow = typeof t.evalCases.$inferSelect;

function toRecord(row: CaseRow): EvalCaseRecord {
  return {
    id: row.id,
    owner_kind: 'agent',
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles,
    input_meta: EvalCaseMeta.parse(row.inputMeta),
    expected_output: EvalExpectation.parse(row.expectedOutput),
    notes: row.notes,
    source_finding_id: row.sourceFindingId,
    created_at: row.createdAt.toISOString(),
  };
}

export async function caseBySourceFinding(
  db: Db,
  findingId: string,
): Promise<EvalCaseRecord | undefined> {
  const [row] = await db
    .select()
    .from(t.evalCases)
    .where(eq(t.evalCases.sourceFindingId, findingId));
  return row ? toRecord(row) : undefined;
}

/**
 * Insert the case. The partial unique index on `source_finding_id` turns a concurrent second
 * insert into a no-op; the existing case is then re-read and returned with `created: false`.
 */
export async function insertCase(
  db: Db,
  values: NewEvalCase,
): Promise<{ record: EvalCaseRecord; created: boolean }> {
  const [row] = await db
    .insert(t.evalCases)
    .values({
      workspaceId: values.workspaceId,
      ownerKind: 'agent',
      ownerId: values.agentId,
      name: values.name,
      inputDiff: values.inputDiff,
      inputFiles: values.inputFiles,
      inputMeta: values.inputMeta,
      expectedOutput: values.expected,
      sourceFindingId: values.sourceFindingId,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return { record: toRecord(row), created: true };

  const existing = await caseBySourceFinding(db, values.sourceFindingId);
  if (!existing) throw new Error('Eval case insert conflicted but no case exists for the finding');
  return { record: existing, created: false };
}

/** An agent's cases, newest first. */
export async function listCases(db: Db, agentId: string): Promise<EvalCaseRecord[]> {
  const rows = await db
    .select()
    .from(t.evalCases)
    .where(and(eq(t.evalCases.ownerKind, 'agent'), eq(t.evalCases.ownerId, agentId)))
    .orderBy(desc(t.evalCases.createdAt), desc(t.evalCases.id));
  return rows.map(toRecord);
}

/** Workspace-scoped; its `eval_runs` rows go by the FK cascade. */
export async function deleteCase(db: Db, workspaceId: string, caseId: string): Promise<boolean> {
  const rows = await db
    .delete(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
    .returning({ id: t.evalCases.id });
  return rows.length > 0;
}

export async function countCases(db: Db, agentId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(t.evalCases)
    .where(and(eq(t.evalCases.ownerKind, 'agent'), eq(t.evalCases.ownerId, agentId)));
  return row?.n ?? 0;
}

/** An agent's cases in a stable order, read once when a run starts. */
export async function casesForRun(db: Db, agentId: string): Promise<EvalCaseRecord[]> {
  const rows = await db
    .select()
    .from(t.evalCases)
    .where(and(eq(t.evalCases.ownerKind, 'agent'), eq(t.evalCases.ownerId, agentId)))
    .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.id));
  return rows.map(toRecord);
}
