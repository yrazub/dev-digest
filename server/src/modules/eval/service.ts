import type { EvalCaseCreateResponse, EvalCaseRecord, EvalExpectation } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { caseName, cutFileSection, rawDiffFromPatches } from './domain.js';
import type { EvalFindingSource, EvalGit, EvalStore } from './ports.js';

export interface EvalServiceDeps {
  store: EvalStore;
  git: EvalGit;
}

/** Eval use cases: build a case from a decided finding, list an agent's cases, delete a case. */
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
