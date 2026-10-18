/**
 * Ports of the project-context module: the clone-file port (a structural copy of
 * `src/adapters/clone-files`, repeated here because a module never imports an
 * adapter) and the persistence ports of the attachments. Imports nothing.
 */

export interface ProjectFileEntry {
  path: string;
  size: number;
}

export type ProjectFileMiss = 'not_found' | 'too_large' | 'unreadable' | 'outside_clone';

export type ProjectFilesListResult =
  | { kind: 'not_cloned' }
  | { kind: 'entries'; entries: ProjectFileEntry[] };

export type ProjectFilesReadResult =
  | { kind: 'not_cloned' }
  | { kind: 'text'; text: string }
  | { kind: 'miss'; miss: ProjectFileMiss };

/** Lists and reads the files of a repository's clone. Adapter: `FsCloneFiles`. */
export interface ProjectFiles {
  list(
    repo: { owner: string; name: string },
    opts: { excludedDirs: readonly string[] },
  ): Promise<ProjectFilesListResult>;
  read(
    repo: { owner: string; name: string },
    path: string,
    opts: { maxBytes: number },
  ): Promise<ProjectFilesReadResult>;
}

export interface ContextRepo {
  id: string;
  owner: string;
  name: string;
  clonePath: string | null;
}

export interface UsedByCounts {
  agentsDirect: number;
  agentsViaSkill: number;
  skills: number;
}

export interface ProjectContextStore {
  findRepo(workspaceId: string, repoId: string): Promise<ContextRepo | undefined>;
  agentExists(workspaceId: string, agentId: string): Promise<boolean>;
  skillExists(workspaceId: string, skillId: string): Promise<boolean>;
  /** Attached paths in stored order. */
  agentPaths(agentId: string): Promise<string[]>;
  skillPaths(skillId: string): Promise<string[]>;
  /** Replaces the owner's list with exactly `paths`, stored in that order. */
  replaceAgentPaths(agentId: string, paths: readonly string[]): Promise<void>;
  replaceSkillPaths(skillId: string, paths: readonly string[]): Promise<void>;
  usedBy(workspaceId: string, path: string): Promise<UsedByCounts>;
  /**
   * What a review run attaches: the agent's paths in order, then each enabled skill
   * linked to the agent in `agent_skills.order` with its paths in order (R-SRV-22).
   */
  runAttachments(agentId: string): Promise<RunAttachments>;
  /**
   * What the enabled agents of a workspace attach (R-SRV-24): per agent its paths and its
   * enabled linked skills with their paths, each in stored order.
   */
  workspaceAttachments(workspaceId: string): Promise<WorkspaceAgentAttachments[]>;
}

export interface RunAttachments {
  agentPaths: string[];
  skills: { name: string; paths: string[] }[];
}

export interface WorkspaceAgentAttachments {
  agentName: string;
  agentPaths: string[];
  skills: { name: string; paths: string[] }[];
}

/** Runs `work` in one transaction; the store it receives writes through that transaction. */
export interface ProjectContextUnitOfWork {
  run<T>(work: (store: ProjectContextStore) => Promise<T>): Promise<T>;
}
