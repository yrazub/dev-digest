import type {
  EvalCaseCreateResponse,
  EvalCaseRecord,
  EvalExpectation,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  LLMProvider,
  Provider,
} from '@devdigest/shared';
import { AppError, ConfigError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { MAX_CASES_PER_RUN } from './constants.js';
import { caseName, cutFileSection, rawDiffFromPatches } from './domain.js';
import type { EvalFindingSource, EvalGit, EvalLog, EvalStore } from './ports.js';
import type { EvalRunExecutor } from './run-executor.js';

export interface EvalServiceDeps {
  store: EvalStore;
  git: EvalGit;
  /** Resolves a provider's client; throws `ConfigError` when its key is missing. */
  llm: (provider: Provider) => Promise<LLMProvider>;
  executor: EvalRunExecutor;
}

/** Eval use cases: cases from decided findings, and background runs of an agent on its cases. */
export class EvalService {
  constructor(private readonly deps: EvalServiceDeps) {}

  /** Create the finding's case; `created: false` when it already has one (R-SRV-1–R-SRV-12). */
  async createCase(workspaceId: string, findingId: string): Promise<EvalCaseCreateResponse> {
    const { store } = this.deps;
    const finding = await store.findFindingSource(workspaceId, findingId);
    if (!finding) throw new NotFoundError('Finding not found');
    if (!finding.accepted && !finding.dismissed) {
      throw new ValidationError('Accept or dismiss the finding first');
    }
    if (!finding.agentId || !(await store.agentExists(workspaceId, finding.agentId))) {
      throw new ValidationError('No agent for this finding');
    }

    const existing = await store.caseBySourceFinding(finding.id);
    if (existing) return { case: existing, created: false };

    const raw = await this.loadRawDiff(finding);
    const fragment = cutFileSection(raw, finding.file, {
      start_line: finding.startLine,
      end_line: finding.endLine,
    });
    if (fragment === null) throw new ValidationError(`No diff available for ${finding.file}`);

    const expected: EvalExpectation = {
      kind: finding.accepted ? 'must_find' : 'must_not_flag',
      file: finding.file,
      start_line: finding.startLine,
      end_line: finding.endLine,
      title: finding.title,
      severity: finding.severity,
      category: finding.category,
    };
    const { record, created } = await store.insertCase({
      workspaceId,
      agentId: finding.agentId,
      name: caseName(expected.kind, finding.title),
      inputDiff: fragment,
      inputFiles: [finding.file],
      inputMeta: {
        pr_id: finding.pull.id,
        pr_number: finding.pull.number,
        repo: `${finding.repo.owner}/${finding.repo.name}`,
        pr_title: finding.pull.title,
        pr_body: finding.pull.body && finding.pull.body.length > 0 ? finding.pull.body : null,
        pr_author: finding.pull.author,
        head_sha: finding.pull.headSha,
      },
      expected,
      sourceFindingId: finding.id,
    });
    return { case: record, created };
  }

  async listCases(workspaceId: string, agentId: string): Promise<{ cases: EvalCaseRecord[] }> {
    if (!(await this.deps.store.agentExists(workspaceId, agentId))) {
      throw new NotFoundError('Agent not found');
    }
    return { cases: await this.deps.store.listCases(agentId) };
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    if (!(await this.deps.store.deleteCase(workspaceId, caseId))) {
      throw new NotFoundError('Eval case not found');
    }
  }

  /**
   * Start a run of the agent on its whole case set and return it `running`; the cases are
   * reviewed in the background, not awaited (R-SRV-15–R-SRV-17, R-SRV-27–R-SRV-30).
   */
  async startRun(workspaceId: string, agentId: string, log: EvalLog): Promise<EvalSuiteRun> {
    const { store } = this.deps;
    const agent = await store.agentSnapshot(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const total = await store.countCases(agentId);
    if (total === 0) throw new ValidationError('This agent has no eval cases');
    if (total > MAX_CASES_PER_RUN) {
      throw new ValidationError(
        `An eval run takes at most ${MAX_CASES_PER_RUN} cases; this agent has ${total}`,
      );
    }

    let llm: LLMProvider;
    try {
      llm = await this.deps.llm(agent.provider);
    } catch (err) {
      if (!(err instanceof ConfigError)) throw err;
      throw new AppError(
        'eval_unavailable',
        `No API key for ${agent.provider}. Add it in Settings.`,
        400,
      );
    }

    if (await store.hasRunningRun(agentId)) throw runInProgress();

    // The snapshot, the skill bodies and the cases are read once; the whole run uses these.
    const skills = await store.promptSkills(agentId);
    const cases = await store.casesForRun(agentId);
    const snapshot = {
      agent_version: agent.version,
      system_prompt: agent.systemPrompt,
      provider: agent.provider,
      model: agent.model,
      strategy: agent.strategy,
      skills: skills.map((s) => ({ name: s.name, version: s.version })),
    };
    const run = await store.insertRun({
      workspaceId,
      agentId,
      agentName: agent.name,
      config: snapshot,
      casesTotal: cases.length,
    });
    if (run === 'conflict') throw runInProgress();

    // `run()` never rejects, so the unawaited promise cannot become an unhandled rejection.
    void this.deps.executor.run({ runId: run.id, agentId, snapshot, skills, cases, llm }, log);
    return run;
  }

  async listRuns(
    workspaceId: string,
    agentId: string,
    limit: number,
    offset: number,
  ): Promise<{ runs: EvalSuiteRun[]; total: number }> {
    if (!(await this.deps.store.agentExists(workspaceId, agentId))) {
      throw new NotFoundError('Agent not found');
    }
    return this.deps.store.listRuns(workspaceId, agentId, limit, offset);
  }

  async getRun(workspaceId: string, runId: string): Promise<EvalSuiteRunDetail> {
    const run = await this.deps.store.runDetail(workspaceId, runId);
    if (!run) throw new NotFoundError('Eval run not found');
    return run;
  }

  /** The PR diff as review runs load it: the clone's `git diff`, else the stored `pr_files` patches. */
  private async loadRawDiff(finding: EvalFindingSource): Promise<string> {
    try {
      const diff = await this.deps.git.diff(finding.repo, finding.pull.base, finding.pull.headSha);
      if (diff.files.length > 0) return diff.raw;
    } catch {
      /* fall through to the pr_files reconstruction */
    }
    return rawDiffFromPatches(await this.deps.store.prPatches(finding.pull.id));
  }
}

function runInProgress(): AppError {
  return new AppError('eval_run_in_progress', 'An eval run of this agent is already running', 409);
}
