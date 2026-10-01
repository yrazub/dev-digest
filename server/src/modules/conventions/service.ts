import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionList,
  ConventionSkillCreate,
  ConventionSkillDraft,
  ConventionUpdate,
  LLMProvider,
  Skill,
} from '@devdigest/shared';
import {
  AppError,
  ConfigError,
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import { buildSkillDraft, draftSkillName, evidenceFiles } from './draft.js';
import {
  evidenceKey,
  normalizeRule,
  toCandidate,
  type ConventionRecord,
  type EvidenceRepo,
} from './domain.js';
import { ConventionLlmOutput } from './llm-schema.js';
import type {
  ConventionModelGateway,
  ConventionSampleSource,
  ConventionStore,
  ConventionsUnitOfWork,
  RepoFileReader,
  ScanRepo,
} from './ports.js';
import { buildConventionsPrompt } from './prompt.js';
import { SAMPLE_CODE_FILES, capCode, capConfig, configCandidates, type SampledFile } from './sample.js';
import { verifyCandidates } from './verify.js';

export interface ConventionsServiceDeps {
  store: ConventionStore;
  uow: ConventionsUnitOfWork;
  samples: ConventionSampleSource;
  files: RepoFileReader;
  models: ConventionModelGateway;
}

/** Stays under the route's budget, so a slow model fails as a clear error rather than a dropped socket. */
const LLM_TIMEOUT_MS = 110_000;

const NOT_INDEXED = 'Index this repo before scanning it for conventions';

/**
 * L02 — Conventions Extractor. `extract` runs the pipeline: sample (code
 * only) → classify (one LLM call) → verify evidence (code only) → persist.
 * The rest is candidate review: list, accept, reject, edit.
 */
export class ConventionsService {
  constructor(private deps: ConventionsServiceDeps) {}

  async list(workspaceId: string, repoId: string): Promise<ConventionList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const [records, scan] = await Promise.all([
      this.deps.store.list(workspaceId, repoId),
      this.deps.store.getScanInfo(workspaceId, repoId),
    ]);
    return {
      scan: { last_scan_at: scan?.lastScanAt ?? null, sampled_files: scan?.sampledFiles ?? null },
      candidates: records.map((r) => toCandidate(r, evidenceRepo(repo))),
    };
  }

  async extract(workspaceId: string, userId: string, repoId: string): Promise<ConventionExtractResult> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.indexedSha) throw new ConflictError(NOT_INDEXED);

    const files = await this.sample(repo);
    if (!files.some((f) => f.kind === 'code')) throw new ConflictError(NOT_INDEXED);

    const choice = await this.deps.models.resolve(workspaceId);
    const llm = await this.provider(choice.provider);
    const res = await llm
      .completeStructured({
        model: choice.model,
        schema: ConventionLlmOutput,
        schemaName: 'conventions',
        messages: buildConventionsPrompt(repo.fullName, files),
        temperature: 0.2,
        timeoutMs: LLM_TIMEOUT_MS,
        maxRetries: 1,
      })
      .catch((err: unknown) => {
        if (err instanceof AppError) throw err;
        throw new ExternalServiceError(
          `The conventions model (${choice.provider}/${choice.model}) failed: ${(err as Error).message}`,
        );
      });
    const proposed = res.data.candidates;
    const { verified, dropped } = verifyCandidates(proposed, files);

    const scannedAt = new Date().toISOString();
    await this.deps.uow.run(async (store) => {
      // A rule the user already accepted or rejected is never proposed again (#48):
      // same wording, or the same evidence (so an edited rule's original wording stays gone).
      const decided = new Set(
        (await store.list(workspaceId, repoId))
          .filter((r) => r.status !== 'pending')
          .flatMap((r) => [normalizeRule(r.rule), evidenceKey(r.evidencePath, r.evidenceLineStart)]),
      );
      await store.deletePending(workspaceId, repoId);
      await store.insertMany(
        workspaceId,
        repoId,
        verified.filter(
          (v) =>
            !decided.has(normalizeRule(v.rule)) &&
            !decided.has(evidenceKey(v.evidencePath, v.evidenceLineStart)),
        ),
      );
      await store.saveScanInfo(workspaceId, userId, repoId, {
        lastScanAt: scannedAt,
        sampledFiles: files.length,
      });
    });

    const records = await this.deps.store.list(workspaceId, repoId);
    return {
      candidates: records.map((r) => toCandidate(r, evidenceRepo(repo))),
      stats: {
        sampled_files: files.length,
        proposed: proposed.length,
        verified: verified.length,
        dropped,
        model: `${choice.provider}/${choice.model}`,
        scanned_at: scannedAt,
      },
    };
  }

  async update(workspaceId: string, id: string, patch: ConventionUpdate): Promise<ConventionCandidate> {
    const found = await this.deps.store.find(workspaceId, id);
    if (!found) throw new NotFoundError('Convention not found');
    await this.deps.store.update(workspaceId, id, {
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.rule !== undefined && { rule: patch.rule }),
      ...(patch.category !== undefined && { category: patch.category }),
    });
    const repo = await this.requireRepo(workspaceId, found.repoId);
    const updated = await this.deps.store.find(workspaceId, id);
    if (!updated) throw new NotFoundError('Convention not found');
    return toCandidate(updated.record, evidenceRepo(repo));
  }

  /** The merged skill for the chosen accepted candidates; stores nothing. */
  async skillDraft(workspaceId: string, repoId: string, candidateIds: string[]): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const accepted = await this.requireAccepted(workspaceId, repoId, candidateIds);
    const taken = new Set(await this.deps.store.skillNames(workspaceId));
    const name = draftSkillName(repo.name, (n) => taken.has(n));
    return buildSkillDraft(name, repo.fullName, accepted);
  }

  /**
   * Saves the (possibly edited) draft as a skill with v1, in one transaction.
   * Linking it to an agent is the agent's Skills tab, like any other skill.
   */
  async createSkill(workspaceId: string, repoId: string, input: ConventionSkillCreate): Promise<Skill> {
    await this.requireRepo(workspaceId, repoId);
    const accepted = await this.requireAccepted(workspaceId, repoId, input.candidate_ids);
    return this.deps.uow.run(async (store) => {
      if ((await store.skillNames(workspaceId)).includes(input.name)) {
        throw new ConflictError(`A skill named "${input.name}" already exists`);
      }
      return store.insertSkill({
        workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        body: input.body,
        enabled: input.enabled,
        evidenceFiles: evidenceFiles(accepted),
      });
    });
  }

  /** Every id must be one of this repo's candidates and accepted (#48: rejected never reach a skill). */
  private async requireAccepted(
    workspaceId: string,
    repoId: string,
    ids: string[],
  ): Promise<ConventionRecord[]> {
    const byId = new Map((await this.deps.store.list(workspaceId, repoId)).map((r) => [r.id, r]));
    const picked = [...new Set(ids)].map((id) => byId.get(id));
    if (picked.some((r) => r?.status !== 'accepted')) {
      throw new ValidationError('Only accepted conventions of this repo can become a skill');
    }
    return picked as ConventionRecord[];
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<ScanRepo> {
    const repo = await this.deps.store.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  /** Step 1, no model: the configs that exist, then repo-intel's top-ranked code files. */
  private async sample(repo: ScanRepo): Promise<SampledFile[]> {
    const ref = { owner: repo.owner, name: repo.name };
    const codePaths = await this.deps.samples.getConventionSamples(repo.id, SAMPLE_CODE_FILES);
    const read = async (path: string) => {
      try {
        const text = await this.deps.files.readFile(ref, path);
        return text.trim() ? text : null;
      } catch {
        return null;
      }
    };
    const [configs, code] = await Promise.all([
      Promise.all(configCandidates(codePaths).map(async (path) => ({ path, text: await read(path) }))),
      Promise.all(codePaths.map(async (path) => ({ path, text: await read(path) }))),
    ]);
    return [
      ...configs.flatMap((f) => (f.text ? [{ path: f.path, kind: 'config' as const, content: capConfig(f.text) }] : [])),
      ...code.flatMap((f) => (f.text ? [{ path: f.path, kind: 'code' as const, content: capCode(f.text) }] : [])),
    ];
  }

  /** A missing provider key is the user's to fix in Settings, so say where. */
  private async provider(id: Parameters<ConventionModelGateway['provider']>[0]): Promise<LLMProvider> {
    try {
      return await this.deps.models.provider(id);
    } catch (err) {
      if (err instanceof AppError) {
        throw new ConfigError(
          `${err.message}. Pick a model you have a key for in Settings → Models → Conventions.`,
        );
      }
      throw err;
    }
  }
}

function evidenceRepo(repo: ScanRepo): EvidenceRepo {
  return { owner: repo.owner, name: repo.name, sha: repo.indexedSha };
}
