import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import type { SkillFieldChanges, SkillVersionState } from './domain.js';

/**
 * Persistence ports for the skills service. The Drizzle implementation is
 * `repository.ts`; tests can fake these without Postgres.
 */

export interface NewSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
  evidenceFiles: string[] | null;
}

export interface SkillVersionRecord {
  version: number;
  body: string;
  note: string | null;
  createdAt: Date;
}

export interface SkillStore {
  list(workspaceId: string): Promise<Skill[]>;
  get(workspaceId: string, id: string): Promise<Skill | undefined>;
  /** Id of the workspace skill with this name, if any. */
  findIdByName(workspaceId: string, name: string): Promise<string | undefined>;
  insert(skill: NewSkill): Promise<string>;
  /**
   * The skill's current body and version, row-locked until the transaction
   * ends (`SELECT … FOR UPDATE`), so concurrent saves serialise on it. Only
   * meaningful inside `SkillsUnitOfWork.run`.
   */
  lockVersionState(workspaceId: string, id: string): Promise<SkillVersionState | undefined>;
  update(workspaceId: string, id: string, changes: SkillFieldChanges): Promise<void>;
  delete(workspaceId: string, id: string): Promise<boolean>;
  insertVersion(skillId: string, version: number, body: string, note: string | null): Promise<void>;
  /** Newest first. */
  listVersions(skillId: string): Promise<SkillVersionRecord[]>;
  getVersion(skillId: string, version: number): Promise<SkillVersionRecord | undefined>;
}

/** Runs `work` in one transaction; the stores it receives write through that transaction. */
export interface SkillsUnitOfWork {
  run<T>(work: (store: SkillStore) => Promise<T>): Promise<T>;
}
