import type { EvalCaseRecord, EvalOverview, EvalSuiteRun, EvalSuiteRunDetail } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import type { PromptSkill } from '../_shared/review-prompt.js';
import type {
  EvalAgentSnapshot,
  EvalFindingSource,
  EvalResultRow,
  EvalRunFinish,
  EvalStore,
  EvalStoredResult,
  NewEvalCase,
  NewEvalRun,
} from './ports.js';
import * as caseRepo from './repository/case.repo.js';
import * as overviewRepo from './repository/overview.repo.js';
import * as runRepo from './repository/run.repo.js';
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

  countCases(agentId: string): Promise<number> {
    return caseRepo.countCases(this.db, agentId);
  }

  casesForRun(agentId: string): Promise<EvalCaseRecord[]> {
    return caseRepo.casesForRun(this.db, agentId);
  }

  // ---- runs ------------------------------------------------------------------

  hasRunningRun(agentId: string): Promise<boolean> {
    return runRepo.hasRunningRun(this.db, agentId);
  }

  insertRun(values: NewEvalRun): Promise<EvalSuiteRun | 'conflict'> {
    return runRepo.insertRun(this.db, values);
  }

  storeResult(runId: string, row: EvalResultRow): Promise<'stored' | 'case_gone' | 'run_gone'> {
    return runRepo.storeResult(this.db, runId, row);
  }

  resultsOf(runId: string): Promise<EvalStoredResult[]> {
    return runRepo.resultsOf(this.db, runId);
  }

  finishRun(runId: string, finish: EvalRunFinish): Promise<boolean> {
    return runRepo.finishRun(this.db, runId, finish);
  }

  listRuns(
    workspaceId: string,
    agentId: string,
    limit: number,
    offset: number,
  ): Promise<{ runs: EvalSuiteRun[]; total: number }> {
    return runRepo.listRuns(this.db, workspaceId, agentId, limit, offset);
  }

  runDetail(workspaceId: string, runId: string): Promise<EvalSuiteRunDetail | undefined> {
    return runRepo.runDetail(this.db, workspaceId, runId);
  }

  reapRunning(): Promise<number> {
    return runRepo.reapRunning(this.db);
  }

  // ---- dashboard ---------------------------------------------------------------

  overview(workspaceId: string): Promise<EvalOverview> {
    return overviewRepo.overview(this.db, workspaceId);
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

  agentSnapshot(workspaceId: string, agentId: string): Promise<EvalAgentSnapshot | undefined> {
    return sourceRepo.agentSnapshot(this.db, workspaceId, agentId);
  }

  promptSkills(agentId: string): Promise<PromptSkill[]> {
    return sourceRepo.promptSkills(this.db, agentId);
  }
}
