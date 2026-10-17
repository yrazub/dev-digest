import type {
  AgentContext,
  ProjectContextFile,
  ProjectContextList,
  SkillContext,
  SpecFile,
} from '@devdigest/shared';
import { ContextDocPath } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  CONTEXT_EXCLUDED_DIRS,
  CONTEXT_RUN_CAP_TOKENS,
  CONTEXT_SOFT_CAP_TOKENS,
  MAX_CONTEXT_DOCS,
  MAX_CONTEXT_DOC_BYTES,
} from './constants.js';
import { isDocumentPath, kindOf, selectDocuments, type DocumentEntry } from './domain.js';
import type {
  ContextRepo,
  ProjectContextStore,
  ProjectContextUnitOfWork,
  ProjectFiles,
} from './ports.js';

export interface ProjectContextServiceDeps {
  store: ProjectContextStore;
  uow: ProjectContextUnitOfWork;
  files: ProjectFiles;
  tokenizer: { count(text: string): number };
  roots: string[];
}

/** Documents read at the same time while listing. */
const READ_CONCURRENCY = 16;

type DocState = Pick<SpecFile, 'status' | 'tokens'> & { content: string | null };

/**
 * L05 — project-context service. Discovers the markdown documents of a
 * repository's clone through the clone-file port, previews them, and stores the
 * paths an agent or a skill attaches. Document text is read on every request and
 * never stored or cached. Every read and write is scoped by `workspaceId`.
 */
export class ProjectContextService {
  constructor(private deps: ProjectContextServiceDeps) {}

  async list(workspaceId: string, repoId: string): Promise<ProjectContextList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const base = {
      roots: this.deps.roots,
      cap: MAX_CONTEXT_DOCS,
      soft_cap_tokens: CONTEXT_SOFT_CAP_TOKENS,
      run_cap_tokens: CONTEXT_RUN_CAP_TOKENS,
    };
    const notCloned: ProjectContextList = {
      state: 'not_cloned',
      documents: [],
      total_tokens: 0,
      capped: false,
      ...base,
    };
    if (repo.clonePath === null) return notCloned;

    const listed = await this.deps.files.list(repo, { excludedDirs: CONTEXT_EXCLUDED_DIRS });
    if (listed.kind === 'not_cloned') return notCloned;

    const { documents, capped } = selectDocuments(listed.entries, this.deps.roots);
    const states = await mapLimit(documents, READ_CONCURRENCY, (doc) => this.stateOf(repo, doc));

    const out: SpecFile[] = [];
    let totalTokens = 0;
    documents.forEach((doc, i) => {
      const state = states[i];
      if (!state) return; // vanished after the walk (race): left out
      out.push({
        path: doc.path,
        kind: doc.kind,
        size: doc.size,
        tokens: state.tokens,
        status: state.status,
      });
      totalTokens += state.tokens ?? 0;
    });
    return { state: 'ready', documents: out, total_tokens: totalTokens, capped, ...base };
  }

  async file(workspaceId: string, repoId: string, path: string): Promise<ProjectContextFile> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!ContextDocPath.safeParse(path).success || repo.clonePath === null) {
      throw new NotFoundError('Document not found');
    }
    const listed = await this.deps.files.list(repo, { excludedDirs: CONTEXT_EXCLUDED_DIRS });
    if (listed.kind === 'not_cloned') throw new NotFoundError('Document not found');
    const doc = selectDocuments(listed.entries, this.deps.roots).documents.find(
      (d) => d.path === path,
    );
    if (!doc) throw new NotFoundError('Document not found');

    const state = await this.stateOf(repo, doc);
    if (!state) throw new NotFoundError('Document not found');
    const usedBy = await this.deps.store.usedBy(workspaceId, path);
    return {
      path: doc.path,
      kind: doc.kind,
      size: doc.size,
      tokens: state.tokens,
      status: state.status,
      content: state.content,
      used_by: {
        agents_direct: usedBy.agentsDirect,
        agents_via_skill: usedBy.agentsViaSkill,
        skills: usedBy.skills,
      },
    };
  }

  async agentContext(workspaceId: string, agentId: string): Promise<AgentContext> {
    await this.requireAgent(workspaceId, agentId);
    return { paths: await this.deps.store.agentPaths(agentId) };
  }

  async skillContext(workspaceId: string, skillId: string): Promise<SkillContext> {
    await this.requireSkill(workspaceId, skillId);
    return { paths: await this.deps.store.skillPaths(skillId) };
  }

  async setAgentContext(
    workspaceId: string,
    agentId: string,
    paths: string[],
  ): Promise<AgentContext> {
    await this.requireAgent(workspaceId, agentId);
    this.assertUnderRoots(paths);
    return this.deps.uow.run(async (store) => {
      await store.replaceAgentPaths(agentId, paths);
      return { paths: await store.agentPaths(agentId) };
    });
  }

  async setSkillContext(
    workspaceId: string,
    skillId: string,
    paths: string[],
  ): Promise<SkillContext> {
    await this.requireSkill(workspaceId, skillId);
    this.assertUnderRoots(paths);
    return this.deps.uow.run(async (store) => {
      await store.replaceSkillPaths(skillId, paths);
      return { paths: await store.skillPaths(skillId) };
    });
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<ContextRepo> {
    const repo = await this.deps.store.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  private async requireAgent(workspaceId: string, agentId: string): Promise<void> {
    if (!(await this.deps.store.agentExists(workspaceId, agentId))) {
      throw new NotFoundError('Agent not found');
    }
  }

  private async requireSkill(workspaceId: string, skillId: string): Promise<void> {
    if (!(await this.deps.store.skillExists(workspaceId, skillId))) {
      throw new NotFoundError('Skill not found');
    }
  }

  /** R-SRV-35: every path is a markdown path under a configured search root. */
  private assertUnderRoots(paths: readonly string[]): void {
    for (const path of paths) {
      if (!isDocumentPath(path) || kindOf(path, this.deps.roots) === null) {
        throw new ValidationError('Path is not under a project context folder', { path });
      }
    }
  }

  /**
   * Status, tokens and text of one listed document, or `undefined` when it is no
   * longer readable as a document (a race after the walk: missing, outside the clone).
   */
  private async stateOf(repo: ContextRepo, doc: DocumentEntry): Promise<DocState | undefined> {
    if (doc.size > MAX_CONTEXT_DOC_BYTES) return { status: 'too_large', tokens: null, content: null };
    const read = await this.deps.files.read(repo, doc.path, { maxBytes: MAX_CONTEXT_DOC_BYTES });
    if (read.kind === 'text') {
      return { status: 'ok', tokens: this.deps.tokenizer.count(read.text), content: read.text };
    }
    if (read.kind === 'miss' && (read.miss === 'too_large' || read.miss === 'unreadable')) {
      return { status: read.miss, tokens: null, content: null };
    }
    return undefined;
  }
}

/** `Array.map` with at most `limit` calls in flight; keeps the input order. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
