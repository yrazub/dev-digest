import type {
  AgentContext,
  ContextSkipReason,
  ProjectContextFile,
  ProjectContextList,
  PromptAssembly,
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
import {
  applyRunCap,
  isDocumentPath,
  kindOf,
  mergeEffective,
  mergeWorkspace,
  selectDocuments,
  type DocumentEntry,
  type EffectivePath,
} from './domain.js';
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

/** What a review run takes from project context (R-SRV-23). */
export interface ProjectContextForRun {
  /** The inserted documents in effective order; `text` is what the engine receives. */
  specs: { path: string; text: string }[];
  loaded: NonNullable<PromptAssembly['specs_loaded']>;
  skipped: NonNullable<PromptAssembly['specs_skipped']>;
}

/** What the PR brief takes from project context (R-SRV-24): every document, no run cap. */
export interface ProjectContextForWorkspace {
  /** Distinct attached paths, read or skipped; `0` means nothing is attached. */
  attached: number;
  notCloned: boolean;
  documents: { path: string; text: string }[];
  skipped: { path: string; reason: ContextSkipReason }[];
}

type RunRead =
  | { kind: 'skip'; reason: ContextSkipReason }
  | { kind: 'doc'; text: string; tokens: number };

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

  /**
   * R-SRV-22–R-SRV-27: the effective documents of an agent's run, read once each from
   * the clone's working tree, with every problem recorded as a skip. Calls no LLM.
   */
  async forRun(input: {
    agentId: string;
    repo: { owner: string; name: string; clonePath: string | null };
  }): Promise<ProjectContextForRun> {
    const { agentPaths, skills } = await this.deps.store.runAttachments(input.agentId);
    const effective = mergeEffective(agentPaths, skills);

    const reads: RunRead[] = [];
    let notCloned = input.repo.clonePath === null;
    for (const entry of effective) {
      if (notCloned) {
        reads.push({ kind: 'skip', reason: 'not_cloned' });
        continue;
      }
      const read = await this.deps.files.read(input.repo, entry.path, {
        maxBytes: MAX_CONTEXT_DOC_BYTES,
      });
      if (read.kind === 'not_cloned') {
        notCloned = true;
        reads.push({ kind: 'skip', reason: 'not_cloned' });
      } else if (read.kind === 'miss') {
        reads.push({ kind: 'skip', reason: read.miss });
      } else if (read.text.trim() === '') {
        reads.push({ kind: 'skip', reason: 'empty' });
      } else {
        reads.push({ kind: 'doc', text: read.text, tokens: this.deps.tokenizer.count(read.text) });
      }
    }

    const readable = effective.flatMap((entry, index) => {
      const read = reads[index];
      return read?.kind === 'doc' ? [{ index, tokens: read.tokens }] : [];
    });
    const { overCap } = applyRunCap(readable, CONTEXT_RUN_CAP_TOKENS);
    const overCapIndexes = new Set(overCap.map((d) => d.index));

    const out: ProjectContextForRun = { specs: [], loaded: [], skipped: [] };
    effective.forEach((entry: EffectivePath, index) => {
      const read = reads[index];
      if (!read) return;
      const skip = (reason: ContextSkipReason): void => {
        out.skipped.push({
          path: entry.path,
          origin: entry.origin,
          skill_name: entry.skill_name,
          reason,
        });
      };
      if (read.kind === 'skip') return skip(read.reason);
      if (overCapIndexes.has(index)) return skip('over_cap');
      out.specs.push({ path: entry.path, text: read.text });
      out.loaded.push({
        path: entry.path,
        origin: entry.origin,
        skill_name: entry.skill_name,
        tokens: read.tokens,
        text: read.text,
      });
    });
    return out;
  }

  /**
   * R-SRV-24: the union of the documents attached to every enabled agent of the workspace and
   * to those agents' enabled linked skills, read once each from the clone's working tree. The
   * per-document rules are `forRun`'s; no run cap applies and no LLM is called.
   */
  async forWorkspace(input: {
    workspaceId: string;
    repo: { owner: string; name: string; clonePath: string | null };
  }): Promise<ProjectContextForWorkspace> {
    const agents = await this.deps.store.workspaceAttachments(input.workspaceId);
    const paths = mergeWorkspace(agents);

    const out: ProjectContextForWorkspace = {
      attached: paths.length,
      notCloned: input.repo.clonePath === null,
      documents: [],
      skipped: [],
    };
    for (const path of paths) {
      if (out.notCloned) {
        out.skipped.push({ path, reason: 'not_cloned' });
        continue;
      }
      const read = await this.deps.files.read(input.repo, path, { maxBytes: MAX_CONTEXT_DOC_BYTES });
      if (read.kind === 'not_cloned') {
        out.notCloned = true;
        out.skipped.push({ path, reason: 'not_cloned' });
      } else if (read.kind === 'miss') {
        out.skipped.push({ path, reason: read.miss });
      } else if (read.text.trim() === '') {
        out.skipped.push({ path, reason: 'empty' });
      } else {
        out.documents.push({ path, text: read.text });
      }
    }
    return out;
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
