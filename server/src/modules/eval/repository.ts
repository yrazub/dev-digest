import type { EvalCaseRecord } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { EvalFindingSource, EvalStore, NewEvalCase } from './ports.js';
import * as caseRepo from './repository/case.repo.js';
import * as sourceRepo from './repository/source.repo.js';

/**
 * Eval data-access. The only layer touching the database for the eval module: it owns
 * `eval_cases`, `eval_suite_runs` and `eval_runs`, and reads findings, reviews, pull requests
 * and agents workspace-scoped. The query implementations are colocated, split by aggregate,
 * under `./repository/`; this class composes them.
 */
export class EvalRepository implements EvalStore {
  constructor(private readonly db: Db) {}

  // ---- cases ---------------------------------------------------------------

  caseBySourceFinding(findingId: string): Promise<EvalCaseRecord | undefined> {
    return caseRepo.caseBySourceFinding(this.db, findingId);
  }

  insertCase(values: NewEvalCase): Promise<{ record: EvalCaseRecord; created: boolean }> {
    return caseRepo.insertCase(this.db, values);
  }

  listCases(agentId: string): Promise<EvalCaseRecord[]> {
    return caseRepo.listCases(this.db, agentId);
  }

  deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    return caseRepo.deleteCase(this.db, workspaceId, caseId);
  }

  // ---- rows the module does not own -------------------------------------------

  findFindingSource(workspaceId: string, findingId: string): Promise<EvalFindingSource | undefined> {
    return sourceRepo.findFindingSource(this.db, workspaceId, findingId);
  }

  agentExists(workspaceId: string, agentId: string): Promise<boolean> {
    return sourceRepo.agentExists(this.db, workspaceId, agentId);
  }

  prPatches(prId: string): Promise<{ path: string; patch: string | null }[]> {
    return sourceRepo.prPatches(this.db, prId);
  }
}
