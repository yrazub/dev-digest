import type {
  Skill,
  SkillCreate,
  SkillImportDraft,
  SkillUpdate,
  SkillVersion,
} from '@devdigest/shared';
import type { HttpFetcher } from '../../adapters/http-fetch/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { INITIAL_SKILL_VERSION, planSkillUpdate, restoreNote } from './domain.js';
import { parseSkillMarkdown, parseSkillZip } from './import/parse.js';
import { URL_IMPORT_MAX_BYTES, URL_IMPORT_TIMEOUT_MS, resolveSkillUrl } from './import/url.js';
import type { SkillStore, SkillsUnitOfWork } from './ports.js';

export interface SkillsServiceDeps {
  store: SkillStore;
  uow: SkillsUnitOfWork;
  http: HttpFetcher;
}

/** An uploaded import file, already read by the route. */
export interface UploadedFile {
  filename: string;
  data: Uint8Array;
}

/**
 * L02 — skills service. CRUD over the workspace's skills, body versioning,
 * restore, and import parsing (preview only — saving a draft goes through
 * `create`). Every read and write is scoped by `workspaceId`.
 */
export class SkillsService {
  constructor(private deps: SkillsServiceDeps) {}

  list(workspaceId: string): Promise<Skill[]> {
    return this.deps.store.list(workspaceId);
  }

  async get(workspaceId: string, id: string): Promise<Skill> {
    const skill = await this.deps.store.get(workspaceId, id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  }

  async create(workspaceId: string, input: SkillCreate): Promise<Skill> {
    await this.assertNameFree(workspaceId, input.name);
    const id = await this.deps.uow.run(async (store) => {
      const skillId = await store.insert({
        workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        source: input.source ?? 'manual',
        body: input.body,
        enabled: input.enabled ?? true,
        evidenceFiles: input.evidence_files ?? null,
      });
      await store.insertVersion(skillId, INITIAL_SKILL_VERSION, input.body, null);
      return skillId;
    });
    return this.get(workspaceId, id);
  }

  async update(workspaceId: string, id: string, patch: SkillUpdate): Promise<Skill> {
    const current = await this.get(workspaceId, id);
    if (patch.name !== undefined && patch.name !== current.name) {
      await this.assertNameFree(workspaceId, patch.name);
    }
    await this.deps.uow.run(async (store) => {
      // Plan from the row-locked state, not the read above: a concurrent save
      // waits here and then builds on the version this one writes.
      const locked = await store.lockVersionState(workspaceId, id);
      if (!locked) throw new NotFoundError('Skill not found');
      const plan = planSkillUpdate(locked, patch);
      await store.update(workspaceId, id, plan.changes);
      if (plan.snapshot) {
        await store.insertVersion(id, plan.snapshot.version, plan.snapshot.body, plan.snapshot.note);
      }
    });
    return this.get(workspaceId, id);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const deleted = await this.deps.store.delete(workspaceId, id);
    if (!deleted) throw new NotFoundError('Skill not found');
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[]> {
    const skill = await this.get(workspaceId, id);
    const versions = await this.deps.store.listVersions(id);
    return versions.map((v) => ({
      version: v.version,
      body: v.body,
      note: v.note,
      created_at: v.createdAt.toISOString(),
      current: v.version === skill.version,
    }));
  }

  /** Copy an old body forward as a NEW version; history is never rewritten. */
  async restore(workspaceId: string, id: string, version: number): Promise<Skill> {
    const skill = await this.get(workspaceId, id);
    const old = await this.deps.store.getVersion(id, version);
    if (!old) throw new NotFoundError('Skill version not found');
    if (old.body === skill.body) return skill;
    return this.update(workspaceId, id, { body: old.body, version_note: restoreNote(version) });
  }

  /** Parse an uploaded `.md` or `.zip` into a draft for the preview. Stores nothing. */
  importFile(file: UploadedFile): SkillImportDraft {
    const lower = file.filename.toLowerCase();
    if (lower.endsWith('.zip')) {
      return { ...parseSkillZip(file.data, file.filename), source: 'imported_file' };
    }
    if (lower.endsWith('.md')) {
      const text = new TextDecoder().decode(file.data);
      const fallback = file.filename.replace(/\.md$/i, '');
      return { ...parseSkillMarkdown(text, fallback), source: 'imported_file', ignored_files: [] };
    }
    throw new ValidationError('Upload a .md file or a .zip archive');
  }

  /** Fetch a public `.md` URL and parse it into a draft. Stores nothing. */
  async importUrl(rawUrl: string): Promise<SkillImportDraft> {
    const { fetchUrl, fallbackName } = resolveSkillUrl(rawUrl);
    const text = await this.deps.http.getText(fetchUrl, {
      maxBytes: URL_IMPORT_MAX_BYTES,
      timeoutMs: URL_IMPORT_TIMEOUT_MS,
    });
    return { ...parseSkillMarkdown(text, fallbackName), source: 'imported_url', ignored_files: [] };
  }

  private async assertNameFree(workspaceId: string, name: string): Promise<void> {
    if (await this.deps.store.findIdByName(workspaceId, name)) {
      throw new ConflictError(`A skill named "${name}" already exists`);
    }
  }
}
