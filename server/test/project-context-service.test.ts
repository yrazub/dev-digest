/**
 * `ProjectContextService` (`modules/project-context/service.ts`) with fake ports: `MockCloneFiles`,
 * a counting tokenizer and an in-memory store written here. Hermetic: no database, no
 * filesystem, no network.
 * Spec: `server/specs/L05-project-context.md` (R-SRV-1, R-SRV-5, R-SRV-8, R-SRV-9, R-SRV-11,
 * R-SRV-13–R-SRV-15, R-SRV-17, R-SRV-35–R-SRV-37; `forRun`: R-SRV-22–R-SRV-27); plan:
 * `specs/plans/L05-project-context.md` (phases 5 and 6).
 */
import { describe, it, expect } from 'vitest';
import { MockCloneFiles, type MockCloneFilesOptions } from '../src/adapters/mocks.js';
import { NotFoundError, ValidationError } from '../src/platform/errors.js';
import {
  CONTEXT_RUN_CAP_TOKENS,
  CONTEXT_SOFT_CAP_TOKENS,
  MAX_CONTEXT_DOCS,
  MAX_CONTEXT_DOC_BYTES,
} from '../src/modules/project-context/constants.js';
import type {
  ContextRepo,
  ProjectContextStore,
  ProjectContextUnitOfWork,
  ProjectFiles,
  RunAttachments,
  UsedByCounts,
} from '../src/modules/project-context/ports.js';
import { ProjectContextService } from '../src/modules/project-context/service.js';

// ------------------------------------------------------------------ fakes

const WS = 'ws-1';
const REPO_ID = 'repo-1';
const AGENT_ID = 'agent-1';
const SKILL_ID = 'skill-1';
const ROOTS = ['specs', 'docs', 'insights'];

const CLONED: ContextRepo = { id: REPO_ID, owner: 'acme', name: 'api', clonePath: '/clones/acme/api' };

/** The tokenizer stub: one token per whitespace-separated word; records every text it counted. */
function countingTokenizer() {
  const counted: string[] = [];
  return {
    counted,
    count(text: string): number {
      counted.push(text);
      return text.split(/\s+/).filter(Boolean).length;
    },
  };
}

/** An in-memory store. Owners other than the known ids do not exist. */
class FakeStore implements ProjectContextStore {
  agent: string[] = [];
  skill: string[] = [];
  usedByCounts: UsedByCounts = { agentsDirect: 0, agentsViaSkill: 0, skills: 0 };
  usedByCalls: Array<{ workspaceId: string; path: string }> = [];
  /** The enabled, linked skills of the run, in link order (what `runAttachments` returns). */
  runSkills: RunAttachments['skills'] = [];
  writes = 0;

  constructor(private repo: ContextRepo | undefined) {}

  async findRepo(workspaceId: string, repoId: string) {
    return workspaceId === WS && repoId === REPO_ID ? this.repo : undefined;
  }
  async agentExists(workspaceId: string, agentId: string) {
    return workspaceId === WS && agentId === AGENT_ID;
  }
  async skillExists(workspaceId: string, skillId: string) {
    return workspaceId === WS && skillId === SKILL_ID;
  }
  async agentPaths() {
    return [...this.agent];
  }
  async skillPaths() {
    return [...this.skill];
  }
  async replaceAgentPaths(_agentId: string, paths: readonly string[]) {
    this.writes++;
    this.agent = [...paths];
  }
  async replaceSkillPaths(_skillId: string, paths: readonly string[]) {
    this.writes++;
    this.skill = [...paths];
  }
  async usedBy(workspaceId: string, path: string) {
    this.usedByCalls.push({ workspaceId, path });
    return this.usedByCounts;
  }
  async runAttachments(): Promise<RunAttachments> {
    return { agentPaths: [...this.agent], skills: this.runSkills.map((s) => ({ ...s, paths: [...s.paths] })) };
  }
}

function build(opts: {
  files?: MockCloneFilesOptions['files'];
  cloned?: boolean;
  repo?: ContextRepo | undefined;
  filesPort?: ProjectFiles;
  roots?: string[];
}) {
  const store = new FakeStore('repo' in opts ? opts.repo : CLONED);
  const tokenizer = countingTokenizer();
  const mock = new MockCloneFiles({ files: opts.files, cloned: opts.cloned });
  let uowRuns = 0;
  const uow: ProjectContextUnitOfWork = {
    run: (work) => {
      uowRuns++;
      return work(store);
    },
  };
  const service = new ProjectContextService({
    store,
    uow,
    files: opts.filesPort ?? mock,
    tokenizer,
    roots: opts.roots ?? ROOTS,
  });
  return { service, store, tokenizer, mock, uowRuns: () => uowRuns };
}

const bytes = (n: number) => 'x'.repeat(n);

// ------------------------------------------------------------------ list

describe('ProjectContextService.list', () => {
  it('lists documents sorted by path with kind, size, tokens and status, and the caps', async () => {
    const { service } = build({
      files: {
        'specs/b.md': 'one two three',
        'docs/adr/a.md': 'alpha beta',
        'src/readme.md': 'not under a root',
        'docs/notes.txt': 'not markdown',
      },
    });
    const list = await service.list(WS, REPO_ID);

    expect(list).toMatchObject({
      state: 'ready',
      roots: ROOTS,
      capped: false,
      cap: MAX_CONTEXT_DOCS,
      soft_cap_tokens: CONTEXT_SOFT_CAP_TOKENS,
      run_cap_tokens: CONTEXT_RUN_CAP_TOKENS,
    });
    expect(list.documents).toEqual([
      { path: 'docs/adr/a.md', kind: 'docs', size: 10, tokens: 2, status: 'ok' },
      { path: 'specs/b.md', kind: 'specs', size: 13, tokens: 3, status: 'ok' },
    ]);
    // the list carries no document text (R-SRV-5)
    expect(JSON.stringify(list)).not.toContain('alpha beta');
  });

  it('marks a document over the size limit too_large without reading it', async () => {
    const { service, mock, tokenizer } = build({
      files: {
        'specs/huge.md': { text: 'ignored', size: MAX_CONTEXT_DOC_BYTES + 1 },
        'specs/small.md': 'a b',
      },
    });
    const list = await service.list(WS, REPO_ID);

    expect(list.documents).toEqual([
      { path: 'specs/huge.md', kind: 'specs', size: MAX_CONTEXT_DOC_BYTES + 1, tokens: null, status: 'too_large' },
      { path: 'specs/small.md', kind: 'specs', size: 3, tokens: 2, status: 'ok' },
    ]);
    expect(mock.reads).toEqual(['specs/small.md']);
    expect(tokenizer.counted).toEqual(['a b']);
  });

  it('reads a document of exactly the size limit', async () => {
    const { service, mock } = build({ files: { 'specs/edge.md': bytes(MAX_CONTEXT_DOC_BYTES) } });
    const list = await service.list(WS, REPO_ID);
    expect(mock.reads).toEqual(['specs/edge.md']);
    expect(list.documents[0]).toMatchObject({ status: 'ok', tokens: 1 });
  });

  it('keeps the unreadable and too_large answers of the port, with tokens null', async () => {
    const { service } = build({
      files: {
        'specs/a-bad.md': { text: 'x', miss: 'unreadable' },
        'specs/b-big.md': { text: 'x', miss: 'too_large' },
        'specs/c-ok.md': 'one two',
      },
    });
    const list = await service.list(WS, REPO_ID);
    expect(list.documents.map((d) => [d.path, d.status, d.tokens])).toEqual([
      ['specs/a-bad.md', 'unreadable', null],
      ['specs/b-big.md', 'too_large', null],
      ['specs/c-ok.md', 'ok', 2],
    ]);
  });

  it('sums total_tokens over ok documents only', async () => {
    const { service } = build({
      files: {
        'docs/a.md': 'one two three',
        'docs/b.md': 'four five',
        'docs/c.md': { text: 'x', miss: 'unreadable' },
        'docs/d.md': { text: 'ignored', size: MAX_CONTEXT_DOC_BYTES + 1 },
      },
    });
    const list = await service.list(WS, REPO_ID);
    expect(list.total_tokens).toBe(5);
  });

  it('answers not_cloned for a repository with no clone path, without touching the port', async () => {
    let listed = 0;
    const filesPort: ProjectFiles = {
      list: async () => {
        listed++;
        return { kind: 'entries', entries: [] };
      },
      read: async () => ({ kind: 'not_cloned' }),
    };
    const { service } = build({ repo: { ...CLONED, clonePath: null }, filesPort });
    const list = await service.list(WS, REPO_ID);

    expect(list).toMatchObject({ state: 'not_cloned', documents: [], total_tokens: 0, capped: false, roots: ROOTS });
    expect(listed).toBe(0);
  });

  it('answers not_cloned when the port says the clone is missing', async () => {
    const { service } = build({ cloned: false, files: { 'specs/a.md': 'x' } });
    const list = await service.list(WS, REPO_ID);
    expect(list).toMatchObject({
      state: 'not_cloned',
      documents: [],
      total_tokens: 0,
      cap: MAX_CONTEXT_DOCS,
      soft_cap_tokens: CONTEXT_SOFT_CAP_TOKENS,
      run_cap_tokens: CONTEXT_RUN_CAP_TOKENS,
    });
  });

  it('drops a document whose read answers not_found or outside_clone after the walk listed it', async () => {
    const { service } = build({
      files: {
        'specs/a-gone.md': { text: 'x', miss: 'not_found' },
        'specs/b-out.md': { text: 'x', miss: 'outside_clone' },
        'specs/c-ok.md': 'one',
      },
    });
    const list = await service.list(WS, REPO_ID);
    expect(list.documents.map((d) => d.path)).toEqual(['specs/c-ok.md']);
    expect(list.total_tokens).toBe(1);
  });

  it('answers 404 for an unknown repository', async () => {
    const { service } = build({ repo: undefined });
    await expect(service.list(WS, REPO_ID)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.list('other-workspace', REPO_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reads with bounded concurrency and still returns the documents in path order', async () => {
    const N = 40;
    const names = Array.from({ length: N }, (_, i) => `specs/d${String(i).padStart(2, '0')}.md`);
    let inFlight = 0;
    let maxInFlight = 0;
    const filesPort: ProjectFiles = {
      // shuffled input order: the service must sort, not trust the walk
      list: async () => ({
        kind: 'entries',
        entries: [...names].reverse().map((path) => ({ path, size: 5 })),
      }),
      read: async (_repo, path) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const i = Number(path.slice('specs/d'.length, -'.md'.length));
        // earlier documents answer last, so completion order differs from request order
        await new Promise((r) => setTimeout(r, (N - i) % 7));
        inFlight--;
        return { kind: 'text', text: `t${i}` };
      },
    };
    const { service } = build({ filesPort });
    const list = await service.list(WS, REPO_ID);

    expect(list.documents.map((d) => d.path)).toEqual(names);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(16);
  });

  it('cuts the list at the document cap and says so', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < MAX_CONTEXT_DOCS + 1; i++) files[`docs/f${String(i).padStart(4, '0')}.md`] = 'w';
    const { service } = build({ files });
    const list = await service.list(WS, REPO_ID);
    expect(list.documents).toHaveLength(MAX_CONTEXT_DOCS);
    expect(list.capped).toBe(true);
  });
});

// ------------------------------------------------------------------ file

describe('ProjectContextService.file', () => {
  it('returns the text, the tokens and the Used-by counts of a discovered document', async () => {
    const { service, store } = build({ files: { 'specs/a.md': '# Title\nbody text' } });
    store.usedByCounts = { agentsDirect: 2, agentsViaSkill: 1, skills: 3 };
    const file = await service.file(WS, REPO_ID, 'specs/a.md');

    expect(file).toEqual({
      path: 'specs/a.md',
      kind: 'specs',
      size: 17,
      tokens: 4,
      status: 'ok',
      content: '# Title\nbody text',
      used_by: { agents_direct: 2, agents_via_skill: 1, skills: 3 },
    });
    expect(store.usedByCalls).toEqual([{ workspaceId: WS, path: 'specs/a.md' }]);
  });

  it('answers content null for a too_large document, size-based or port-based', async () => {
    const { service } = build({
      files: {
        'specs/by-size.md': { text: 'ignored', size: MAX_CONTEXT_DOC_BYTES + 1 },
        'specs/by-port.md': { text: 'x', miss: 'too_large' },
        'specs/bad.md': { text: 'x', miss: 'unreadable' },
      },
    });
    for (const [path, status] of [
      ['specs/by-size.md', 'too_large'],
      ['specs/by-port.md', 'too_large'],
      ['specs/bad.md', 'unreadable'],
    ] as const) {
      const file = await service.file(WS, REPO_ID, path);
      expect(file).toMatchObject({ path, status, content: null, tokens: null });
    }
  });

  it('answers 404 for a path that fails the document rules', async () => {
    const { service } = build({ files: { 'specs/a.md': 'x', 'specs/a.txt': 'x' } });
    for (const path of ['../x.md', '/specs/a.md', './specs/a.md', 'specs//a.md', 'specs/./a.md', 'specs/a.txt', '']) {
      await expect(service.file(WS, REPO_ID, path)).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  it('answers 404 for a path that was not discovered (no root, excluded folder, missing)', async () => {
    const { service, mock } = build({
      files: { 'src/a.md': 'x', 'node_modules/docs/b.md': 'x', 'specs/a.md': 'x' },
    });
    for (const path of ['src/a.md', 'node_modules/docs/b.md', 'specs/missing.md']) {
      await expect(service.file(WS, REPO_ID, path)).rejects.toBeInstanceOf(NotFoundError);
    }
    expect(mock.reads).toEqual([]);
  });

  it('answers 404 for a symlinked entry, which the walk never lists', async () => {
    const { service, mock } = build({ files: { 'specs/link.md': { text: 'secret', symlink: true } } });
    await expect(service.file(WS, REPO_ID, 'specs/link.md')).rejects.toBeInstanceOf(NotFoundError);
    expect(mock.reads).toEqual([]);
  });

  it('answers 404 for an unknown repository, a null clone path and a missing clone', async () => {
    await expect(build({ repo: undefined }).service.file(WS, REPO_ID, 'specs/a.md')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      build({ repo: { ...CLONED, clonePath: null }, files: { 'specs/a.md': 'x' } }).service.file(
        WS,
        REPO_ID,
        'specs/a.md',
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      build({ cloned: false, files: { 'specs/a.md': 'x' } }).service.file(WS, REPO_ID, 'specs/a.md'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('answers 404 when the read after the walk drops the document (race)', async () => {
    const { service, store } = build({ files: { 'specs/a.md': { text: 'x', miss: 'not_found' } } });
    await expect(service.file(WS, REPO_ID, 'specs/a.md')).rejects.toBeInstanceOf(NotFoundError);
    expect(store.usedByCalls).toEqual([]);
  });
});

// ------------------------------------------------------------------ attachments

describe('ProjectContextService attachments', () => {
  it('reads the stored paths of an agent and a skill, and 404s for an unknown owner', async () => {
    const { service, store } = build({});
    store.agent = ['docs/b.md', 'docs/a.md'];
    store.skill = ['specs/s.md'];
    expect(await service.agentContext(WS, AGENT_ID)).toEqual({ paths: ['docs/b.md', 'docs/a.md'] });
    expect(await service.skillContext(WS, SKILL_ID)).toEqual({ paths: ['specs/s.md'] });
    await expect(service.agentContext(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.skillContext(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.agentContext('other-workspace', AGENT_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('replaces the list through the unit of work and reads it back in the given order', async () => {
    const { service, store, uowRuns } = build({});
    store.agent = ['docs/old.md'];
    const paths = ['specs/c.md', 'docs/a.md', 'insights/b.md'];
    expect(await service.setAgentContext(WS, AGENT_ID, paths)).toEqual({ paths });
    expect(await service.setSkillContext(WS, SKILL_ID, paths)).toEqual({ paths });
    expect(store.agent).toEqual(paths);
    expect(uowRuns()).toBe(2);
    // an empty list clears it
    expect(await service.setAgentContext(WS, AGENT_ID, [])).toEqual({ paths: [] });
  });

  it('accepts a path nested under a root, and honours configured roots', async () => {
    const { service } = build({ roots: ['adr'] });
    expect(await service.setAgentContext(WS, AGENT_ID, ['x/adr/y/z.md'])).toEqual({ paths: ['x/adr/y/z.md'] });
    await expect(service.setAgentContext(WS, AGENT_ID, ['docs/a.md'])).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a path under no search root with a ValidationError and stores nothing', async () => {
    const { service, store, uowRuns } = build({});
    store.agent = ['docs/keep.md'];
    store.skill = ['docs/keep.md'];
    await expect(service.setAgentContext(WS, AGENT_ID, ['docs/ok.md', 'src/a.md'])).rejects.toMatchObject({
      code: 'validation_error',
      statusCode: 422,
    });
    await expect(service.setSkillContext(WS, SKILL_ID, ['docs/ok.md', 'src/a.md'])).rejects.toBeInstanceOf(
      ValidationError,
    );
    // a file directly named like a root is not "under" it
    await expect(service.setAgentContext(WS, AGENT_ID, ['docs.md'])).rejects.toBeInstanceOf(ValidationError);
    expect(store.writes).toBe(0);
    expect(uowRuns()).toBe(0);
    expect(store.agent).toEqual(['docs/keep.md']);
  });

  it('rejects a malformed path even when it reaches the service past the route schema', async () => {
    const { service, store } = build({});
    for (const path of ['../docs/a.md', '/docs/a.md', 'docs//a.md', 'docs/./a.md', 'docs/a.txt']) {
      await expect(service.setAgentContext(WS, AGENT_ID, [path])).rejects.toBeInstanceOf(ValidationError);
      await expect(service.setSkillContext(WS, SKILL_ID, [path])).rejects.toBeInstanceOf(ValidationError);
    }
    expect(store.writes).toBe(0);
  });

  it('answers 404, not 422, for an unknown owner even with a bad path', async () => {
    const { service } = build({});
    await expect(service.setAgentContext(WS, 'nope', ['src/a.md'])).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.setSkillContext(WS, 'nope', ['src/a.md'])).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ------------------------------------------------------------------ forRun

/** `n` one-word tokens under the counting tokenizer, well below the per-document byte limit. */
const words = (n: number) => 'w '.repeat(n).trim();

describe('ProjectContextService.forRun', () => {
  const REPO = { owner: 'acme', name: 'api', clonePath: '/clones/acme/api' };
  const run = (service: ProjectContextService) => service.forRun({ agentId: AGENT_ID, repo: REPO });

  it('merges the agent first, then each skill in link order, de-duplicating by first occurrence', async () => {
    const { service, store, mock } = build({
      files: {
        'docs/a.md': 'a one',
        'docs/b.md': 'b one',
        'docs/c.md': 'c one',
        'docs/d.md': 'd one',
        'docs/e.md': 'e one',
        'docs/f.md': 'f one',
      },
    });
    store.agent = ['docs/a.md', 'docs/b.md', 'docs/c.md'];
    store.runSkills = [
      { name: 'first-skill', paths: ['docs/c.md', 'docs/d.md', 'docs/a.md'] },
      { name: 'second-skill', paths: ['docs/d.md', 'docs/e.md', 'docs/f.md'] },
    ];
    const out = await run(service);

    expect(out.specs.map((s) => s.path)).toEqual([
      'docs/a.md',
      'docs/b.md',
      'docs/c.md',
      'docs/d.md',
      'docs/e.md',
      'docs/f.md',
    ]);
    expect(out.loaded.map((d) => [d.path, d.origin, d.skill_name])).toEqual([
      ['docs/a.md', 'agent', null],
      ['docs/b.md', 'agent', null],
      ['docs/c.md', 'agent', null],
      ['docs/d.md', 'skill', 'first-skill'],
      ['docs/e.md', 'skill', 'second-skill'],
      ['docs/f.md', 'skill', 'second-skill'],
    ]);
    expect(out.skipped).toEqual([]);
    // every effective path is read exactly once, in effective order
    expect(mock.reads).toEqual(out.specs.map((s) => s.path));
  });

  it('hands the engine the raw text and records tokens and the same text in loaded', async () => {
    const raw = '# Title\n\nbody </untrusted> tail  \n';
    const { service, store } = build({ files: { 'docs/a.md': raw } });
    store.agent = ['docs/a.md'];
    const out = await run(service);

    expect(out.specs).toEqual([{ path: 'docs/a.md', text: raw }]);
    expect(out.loaded).toEqual([
      { path: 'docs/a.md', origin: 'agent', skill_name: null, tokens: 5, text: raw },
    ]);
  });

  it('reads every document with the per-document byte limit', async () => {
    const seen: number[] = [];
    const filesPort: ProjectFiles = {
      list: async () => ({ kind: 'entries', entries: [] }),
      read: async (_repo, _path, opts) => {
        seen.push(opts.maxBytes);
        return { kind: 'text', text: 'x' };
      },
    };
    const { service, store } = build({ filesPort });
    store.agent = ['docs/a.md', 'docs/b.md'];
    await run(service);
    expect(seen).toEqual([MAX_CONTEXT_DOC_BYTES, MAX_CONTEXT_DOC_BYTES]);
  });

  it('skips each problem document with its own reason, in effective order, and loads the rest', async () => {
    const { service, store } = build({
      files: {
        'docs/ok-1.md': 'one two',
        'docs/unreadable.md': { text: 'x', miss: 'unreadable' },
        'docs/port-big.md': { text: 'x', miss: 'too_large' },
        'docs/size-big.md': { text: 'x', size: MAX_CONTEXT_DOC_BYTES + 1 },
        'docs/outside.md': { text: 'x', miss: 'outside_clone' },
        'docs/blank.md': '  \n\t \n',
        'docs/ok-2.md': 'three',
      },
    });
    store.agent = ['docs/unreadable.md', 'docs/ok-1.md', 'docs/missing.md', 'docs/port-big.md'];
    store.runSkills = [
      { name: 'sk', paths: ['docs/size-big.md', 'docs/outside.md', 'docs/blank.md', 'docs/ok-2.md'] },
    ];
    const out = await run(service);

    expect(out.skipped.map((s) => [s.path, s.origin, s.skill_name, s.reason])).toEqual([
      ['docs/unreadable.md', 'agent', null, 'unreadable'],
      ['docs/missing.md', 'agent', null, 'not_found'],
      ['docs/port-big.md', 'agent', null, 'too_large'],
      ['docs/size-big.md', 'skill', 'sk', 'too_large'],
      ['docs/outside.md', 'skill', 'sk', 'outside_clone'],
      ['docs/blank.md', 'skill', 'sk', 'empty'],
    ]);
    expect(out.specs.map((s) => s.path)).toEqual(['docs/ok-1.md', 'docs/ok-2.md']);
    expect(out.loaded.map((d) => d.path)).toEqual(['docs/ok-1.md', 'docs/ok-2.md']);
  });

  it('skips every path as not_cloned, with no port call, when the repository has no clone path', async () => {
    const { service, store, mock } = build({ files: { 'docs/a.md': 'x', 'docs/b.md': 'y' } });
    store.agent = ['docs/a.md'];
    store.runSkills = [{ name: 'sk', paths: ['docs/b.md'] }];
    const out = await service.forRun({ agentId: AGENT_ID, repo: { ...REPO, clonePath: null } });

    expect(out.specs).toEqual([]);
    expect(out.loaded).toEqual([]);
    expect(out.skipped).toEqual([
      { path: 'docs/a.md', origin: 'agent', skill_name: null, reason: 'not_cloned' },
      { path: 'docs/b.md', origin: 'skill', skill_name: 'sk', reason: 'not_cloned' },
    ]);
    expect(mock.reads).toEqual([]);
  });

  it('skips every path as not_cloned when the port reports a missing clone, after one read', async () => {
    const { service, store, mock } = build({ cloned: false, files: { 'docs/a.md': 'x' } });
    store.agent = ['docs/a.md', 'docs/b.md', 'docs/c.md'];
    const out = await run(service);

    expect(out.skipped.map((s) => [s.path, s.reason])).toEqual([
      ['docs/a.md', 'not_cloned'],
      ['docs/b.md', 'not_cloned'],
      ['docs/c.md', 'not_cloned'],
    ]);
    expect(out.specs).toEqual([]);
    expect(mock.reads).toEqual(['docs/a.md']);
  });

  it('keeps what was read before the port reports not_cloned and skips the rest as not_cloned', async () => {
    const reads: string[] = [];
    const filesPort: ProjectFiles = {
      list: async () => ({ kind: 'entries', entries: [] }),
      read: async (_repo, path) => {
        reads.push(path);
        return path === 'docs/a.md' ? { kind: 'text', text: 'alpha' } : { kind: 'not_cloned' };
      },
    };
    const { service, store } = build({ filesPort });
    store.agent = ['docs/a.md', 'docs/b.md', 'docs/c.md'];
    const out = await run(service);

    expect(out.loaded.map((d) => d.path)).toEqual(['docs/a.md']);
    expect(out.skipped.map((s) => [s.path, s.reason])).toEqual([
      ['docs/b.md', 'not_cloned'],
      ['docs/c.md', 'not_cloned'],
    ]);
    expect(reads).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('answers empty results and reads nothing when nothing is attached', async () => {
    const { service, mock } = build({ files: { 'docs/a.md': 'x' } });
    expect(await run(service)).toEqual({ specs: [], loaded: [], skipped: [] });
    expect(mock.reads).toEqual([]);
  });

  it('inserts documents up to the run cap and marks the first one past it, and every later one, over_cap', async () => {
    const { service, store } = build({
      files: {
        'docs/a-fits.md': words(10_000),
        'docs/b-past.md': words(7_000),
        'docs/c-small.md': 'tiny',
      },
    });
    store.agent = ['docs/a-fits.md', 'docs/b-past.md', 'docs/c-small.md'];
    const out = await run(service);

    expect(out.loaded.map((d) => [d.path, d.tokens])).toEqual([['docs/a-fits.md', 10_000]]);
    expect(out.specs.map((s) => s.path)).toEqual(['docs/a-fits.md']);
    expect(out.skipped.map((s) => [s.path, s.reason])).toEqual([
      ['docs/b-past.md', 'over_cap'],
      ['docs/c-small.md', 'over_cap'],
    ]);
  });

  it('accepts a document that lands exactly on the cap, then caps the next one', async () => {
    const { service, store } = build({
      files: { 'docs/a.md': words(CONTEXT_RUN_CAP_TOKENS - 1), 'docs/b.md': 'one', 'docs/c.md': 'two' },
    });
    store.agent = ['docs/a.md', 'docs/b.md', 'docs/c.md'];
    const out = await run(service);

    expect(out.loaded.map((d) => d.path)).toEqual(['docs/a.md', 'docs/b.md']);
    expect(out.skipped.map((s) => [s.path, s.reason])).toEqual([['docs/c.md', 'over_cap']]);
  });

  it('counts only readable, non-empty documents against the cap', async () => {
    const { service, store } = build({
      files: {
        'docs/a-bad.md': { text: words(CONTEXT_RUN_CAP_TOKENS), miss: 'unreadable' },
        'docs/b-blank.md': ' \n ',
        'docs/c-big.md': words(CONTEXT_RUN_CAP_TOKENS),
      },
    });
    store.agent = ['docs/a-bad.md', 'docs/b-blank.md', 'docs/c-big.md'];
    const out = await run(service);

    expect(out.loaded.map((d) => d.path)).toEqual(['docs/c-big.md']);
    expect(out.skipped.map((s) => [s.path, s.reason])).toEqual([
      ['docs/a-bad.md', 'unreadable'],
      ['docs/b-blank.md', 'empty'],
    ]);
  });

  it('keeps the effective order of loaded and skipped when an over_cap document sits between others', async () => {
    const { service, store } = build({
      files: {
        'docs/a.md': words(CONTEXT_RUN_CAP_TOKENS),
        'docs/b.md': 'one',
        'docs/c.md': { text: 'x', miss: 'not_found' },
      },
    });
    store.agent = ['docs/a.md'];
    store.runSkills = [{ name: 'sk', paths: ['docs/b.md', 'docs/c.md'] }];
    const out = await run(service);

    expect(out.loaded.map((d) => d.path)).toEqual(['docs/a.md']);
    expect(out.skipped.map((s) => [s.path, s.origin, s.skill_name, s.reason])).toEqual([
      ['docs/b.md', 'skill', 'sk', 'over_cap'],
      ['docs/c.md', 'skill', 'sk', 'not_found'],
    ]);
  });
});
