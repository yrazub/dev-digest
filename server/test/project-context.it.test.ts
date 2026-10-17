/**
 * The six Project Context routes (`modules/project-context/routes.ts`) against a real Postgres,
 * the built app and `app.inject`. The clone is replaced through `ContainerOverrides.cloneFiles`
 * (`MockCloneFiles`), and `MockSecretsProvider` / `MockGitHubClient` keep the run away from the
 * developer's keys. Every row a test changes (repository, agents, skills) is created here; the
 * seed is only read for its default workspace.
 * Spec: `server/specs/L05-project-context.md` (R-SRV-1, R-SRV-5, R-SRV-8, R-SRV-9, R-SRV-11–R-SRV-15,
 * R-SRV-17–R-SRV-20, R-SRV-35–R-SRV-37); plan: `specs/plans/L05-project-context.md` (phase 5).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { AgentContext, ProjectContextFile, ProjectContextList, SkillContext } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockCloneFiles,
  MockGitClient,
  MockGitHubClient,
  MockSecretsProvider,
  type MockCloneFilesOptions,
} from '../src/adapters/mocks.js';
import { MAX_CONTEXT_DOC_BYTES } from '../src/modules/project-context/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const MARKER = 'ZEBRA-MARKER-7f3a91c2';

const FILES: MockCloneFilesOptions['files'] = {
  'specs/alpha.md': `# Alpha\nbody ${MARKER} words here`,
  'docs/guide/beta.md': 'beta text',
  'insights/gamma.MD': 'gamma text',
  'docs/huge.md': { text: 'ignored', size: MAX_CONTEXT_DOC_BYTES + 1 },
  'docs/broken.md': { text: 'x', miss: 'unreadable' },
  'docs/link.md': { text: 'secret', symlink: true },
  'src/outside.md': 'not under a root',
  'docs/notes.txt': 'not markdown',
  'node_modules/docs/pkg.md': 'excluded folder',
  // used-by and attachment targets
  'docs/used-by.md': 'used by',
  'docs/isolated.md': 'isolated',
  'docs/a.md': 'a',
  'docs/b.md': 'b',
  'docs/c.md': 'c',
  'docs/d.md': 'd',
  'specs/e.md': 'e',
};

d('L05 project context routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let appNotCloned: FastifyInstance;
  let workspaceId: string;
  let foreignWorkspaceId: string;
  let repoId: string;
  let seq = 0;
  const unique = (prefix: string) => `${prefix}-${seq++}`;

  const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  const build = (cloneFiles: MockCloneFiles) =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        git: new MockGitClient(),
        cloneFiles,
      },
    });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
    const [foreign] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'foreign-workspace' })
      .returning({ id: t.workspaces.id });
    foreignWorkspaceId = foreign!.id;
    repoId = await newRepo({ clonePath: '/clones/acme/ctx-api' });
    app = await build(new MockCloneFiles({ files: FILES }));
    appNotCloned = await build(new MockCloneFiles({ cloned: false, files: FILES }));
  });
  afterAll(async () => {
    await app?.close();
    await appNotCloned?.close();
    await pg?.stop();
  });

  // ---------------------------------------------------------------- fixtures

  async function newRepo(o: { clonePath: string | null; workspace?: string }): Promise<string> {
    const name = unique('ctx-repo');
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: o.workspace ?? workspaceId,
        owner: 'acme',
        name,
        fullName: `acme/${name}`,
        clonePath: o.clonePath,
      })
      .returning({ id: t.repos.id });
    return row!.id;
  }

  async function newAgent(o: { enabled?: boolean; workspace?: string } = {}): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId: o.workspace ?? workspaceId,
        name: unique('ctx-agent'),
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt: 'prompt',
        enabled: o.enabled ?? true,
      })
      .returning({ id: t.agents.id });
    return row!.id;
  }

  async function newSkill(o: { enabled?: boolean; workspace?: string } = {}): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.skills)
      .values({
        workspaceId: o.workspace ?? workspaceId,
        name: unique('ctx-skill'),
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: 'b',
        enabled: o.enabled ?? true,
      })
      .returning({ id: t.skills.id });
    return row!.id;
  }

  const attachAgent = (agentId: string, ...paths: string[]) =>
    pg.handle.db.insert(t.agentContextDocs).values(paths.map((path, order) => ({ agentId, path, order })));
  const attachSkill = (skillId: string, ...paths: string[]) =>
    pg.handle.db.insert(t.skillContextDocs).values(paths.map((path, order) => ({ skillId, path, order })));
  const link = (agentId: string, skillId: string) =>
    pg.handle.db.insert(t.agentSkills).values({ agentId, skillId, order: 0 });

  const putAgent = (id: string, paths: unknown) =>
    app.inject({ method: 'PUT', url: `/agents/${id}/context`, payload: { paths } });
  const putSkill = (id: string, paths: unknown) =>
    app.inject({ method: 'PUT', url: `/skills/${id}/context`, payload: { paths } });
  const usedBy = async (path: string) => {
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/context/file?path=${encodeURIComponent(path)}`,
    });
    expect(res.statusCode).toBe(200);
    return ProjectContextFile.parse(res.json()).used_by;
  };

  // ---------------------------------------------------------------- GET /repos/:id/context

  describe('GET /repos/:id/context', () => {
    it('lists the discovered documents sorted by path, with the caps, and no content', async () => {
      const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
      expect(res.statusCode).toBe(200);
      const list = ProjectContextList.parse(res.json());

      expect(list).toMatchObject({
        state: 'ready',
        roots: ['specs', 'docs', 'insights'],
        capped: false,
        cap: 1000,
        soft_cap_tokens: 4000,
        run_cap_tokens: 16000,
      });
      const byPath = Object.fromEntries(list.documents.map((doc) => [doc.path, doc]));
      const paths = list.documents.map((doc) => doc.path);
      expect(paths).toEqual([...paths].sort());
      expect(paths).toEqual(
        expect.arrayContaining(['docs/broken.md', 'docs/guide/beta.md', 'docs/huge.md', 'insights/gamma.MD', 'specs/alpha.md']),
      );
      // not discovered: no root, not markdown, excluded folder, symlink
      for (const missing of ['src/outside.md', 'docs/notes.txt', 'node_modules/docs/pkg.md', 'docs/link.md']) {
        expect(paths).not.toContain(missing);
      }
      expect(byPath['docs/guide/beta.md']).toMatchObject({ kind: 'docs', status: 'ok', size: 9 });
      expect(byPath['docs/guide/beta.md']?.tokens).toBeGreaterThan(0);
      expect(byPath['insights/gamma.MD']).toMatchObject({ kind: 'insights', status: 'ok' });
      expect(byPath['docs/huge.md']).toMatchObject({ status: 'too_large', tokens: null });
      expect(byPath['docs/broken.md']).toMatchObject({ status: 'unreadable', tokens: null });
      const okTokens = list.documents.reduce((n, doc) => n + (doc.status === 'ok' ? (doc.tokens ?? 0) : 0), 0);
      expect(list.total_tokens).toBe(okTokens);
      // R-SRV-5: no document text in the list
      expect(res.body).not.toContain(MARKER);
      expect(list.documents.every((doc) => doc.content === undefined)).toBe(true);
    });

    it('answers not_cloned for a null clone_path and for a clone the port cannot find', async () => {
      const nullPath = await newRepo({ clonePath: null });
      const a = await app.inject({ method: 'GET', url: `/repos/${nullPath}/context` });
      expect(a.statusCode).toBe(200);
      expect(ProjectContextList.parse(a.json())).toMatchObject({
        state: 'not_cloned',
        documents: [],
        total_tokens: 0,
        cap: 1000,
        run_cap_tokens: 16000,
      });

      const b = await appNotCloned.inject({ method: 'GET', url: `/repos/${repoId}/context` });
      expect(b.statusCode).toBe(200);
      expect(ProjectContextList.parse(b.json())).toMatchObject({ state: 'not_cloned', documents: [] });
    });

    it('answers 404 for an unknown or foreign repository and 422 for a malformed id', async () => {
      const foreignRepo = await newRepo({ clonePath: '/clones/x', workspace: foreignWorkspaceId });
      for (const id of [UNKNOWN_ID, foreignRepo]) {
        const res = await app.inject({ method: 'GET', url: `/repos/${id}/context` });
        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe('not_found');
      }
      expect((await app.inject({ method: 'GET', url: '/repos/not-a-uuid/context' })).statusCode).toBe(422);
    });
  });

  // ---------------------------------------------------------------- GET /repos/:id/context/file

  describe('GET /repos/:id/context/file', () => {
    it('returns the text, tokens and Used-by counts of a discovered document', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/context/file?path=${encodeURIComponent('specs/alpha.md')}`,
      });
      expect(res.statusCode).toBe(200);
      const file = ProjectContextFile.parse(res.json());
      expect(file).toMatchObject({
        path: 'specs/alpha.md',
        kind: 'specs',
        status: 'ok',
        content: `# Alpha\nbody ${MARKER} words here`,
        used_by: { agents_direct: 0, agents_via_skill: 0, skills: 0 },
      });
      expect(file.tokens).toBeGreaterThan(0);
    });

    it('answers content null for a too_large and an unreadable document', async () => {
      for (const [path, status] of [
        ['docs/huge.md', 'too_large'],
        ['docs/broken.md', 'unreadable'],
      ] as const) {
        const res = await app.inject({
          method: 'GET',
          url: `/repos/${repoId}/context/file?path=${encodeURIComponent(path)}`,
        });
        expect(res.statusCode).toBe(200);
        expect(ProjectContextFile.parse(res.json())).toMatchObject({ path, status, content: null, tokens: null });
      }
    });

    it('answers 404 for an undiscovered, symlinked, invalid or outside path', async () => {
      for (const path of [
        'specs/missing.md',
        'src/outside.md',
        'docs/link.md',
        'node_modules/docs/pkg.md',
        '../etc/passwd.md',
        '/docs/a.md',
        'docs/notes.txt',
      ]) {
        const res = await app.inject({
          method: 'GET',
          url: `/repos/${repoId}/context/file?path=${encodeURIComponent(path)}`,
        });
        expect(res.statusCode, path).toBe(404);
        expect(res.json().error.code).toBe('not_found');
      }
    });

    it('answers 404 for an unknown or foreign repository, and for a repository that is not cloned', async () => {
      const foreignRepo = await newRepo({ clonePath: '/clones/x', workspace: foreignWorkspaceId });
      const nullPath = await newRepo({ clonePath: null });
      for (const id of [UNKNOWN_ID, foreignRepo, nullPath]) {
        const res = await app.inject({ method: 'GET', url: `/repos/${id}/context/file?path=docs/a.md` });
        expect(res.statusCode).toBe(404);
      }
      const missingClone = await appNotCloned.inject({
        method: 'GET',
        url: `/repos/${repoId}/context/file?path=docs/a.md`,
      });
      expect(missingClone.statusCode).toBe(404);
    });
  });

  // ---------------------------------------------------------------- used_by

  describe('"Used by" counts', () => {
    it('counts agents (any enabled state), skills (any enabled state) and agents through an enabled skill', async () => {
      const path = 'docs/used-by.md';
      const enabledAgent = await newAgent();
      const disabledAgent = await newAgent({ enabled: false });
      await attachAgent(enabledAgent, path);
      await attachAgent(disabledAgent, path);

      const enabledSkill = await newSkill();
      const disabledSkill = await newSkill({ enabled: false });
      await attachSkill(enabledSkill, path);
      await attachSkill(disabledSkill, path);

      // linked to an enabled skill that attaches the path: counted via skill
      const viaEnabled = await newAgent();
      await link(viaEnabled, enabledSkill);
      // linked only to a disabled skill that attaches the path: not counted
      const viaDisabled = await newAgent();
      await link(viaDisabled, disabledSkill);

      expect(await usedBy(path)).toEqual({ agents_direct: 2, agents_via_skill: 1, skills: 2 });
    });

    it('counts an agent once when it attaches the path itself and also links an enabled skill that does', async () => {
      const path = 'docs/a.md';
      const agent = await newAgent();
      const skill = await newSkill();
      await attachAgent(agent, path);
      await attachSkill(skill, path);
      await link(agent, skill);

      expect(await usedBy(path)).toEqual({ agents_direct: 1, agents_via_skill: 0, skills: 1 });
    });

    it('counts an agent once when it links two enabled skills that attach the path', async () => {
      const path = 'docs/b.md';
      const agent = await newAgent();
      const s1 = await newSkill();
      const s2 = await newSkill();
      await attachSkill(s1, path);
      await attachSkill(s2, path);
      await link(agent, s1);
      await link(agent, s2);

      expect(await usedBy(path)).toEqual({ agents_direct: 0, agents_via_skill: 1, skills: 2 });
    });

    it('does not count agents or skills of another workspace on any join', async () => {
      const path = 'docs/c.md';
      const foreignAgent = await newAgent({ workspace: foreignWorkspaceId });
      const foreignSkill = await newSkill({ workspace: foreignWorkspaceId });
      const foreignViaAgent = await newAgent({ workspace: foreignWorkspaceId });
      await attachAgent(foreignAgent, path);
      await attachSkill(foreignSkill, path);
      await link(foreignViaAgent, foreignSkill);

      // links that cross the workspace line, in both directions
      const ownAgent = await newAgent();
      const ownSkill = await newSkill();
      await attachSkill(ownSkill, path);
      await link(ownAgent, foreignSkill); // own agent, foreign skill (attaches the path)
      await link(foreignAgent, ownSkill); // foreign agent, own skill (attaches the path)

      // only the own skill itself is counted; no agent reaches the path in this workspace
      expect(await usedBy(path)).toEqual({ agents_direct: 0, agents_via_skill: 0, skills: 1 });
    });

    it('counts nothing for a document nobody attaches', async () => {
      expect(await usedBy('docs/isolated.md')).toEqual({ agents_direct: 0, agents_via_skill: 0, skills: 0 });
    });
  });

  // ---------------------------------------------------------------- GET / PUT /agents|skills/:id/context

  describe.each([
    { owner: 'agents', make: () => newAgent(), put: putAgent, schema: AgentContext, rows: 'agent' },
    { owner: 'skills', make: () => newSkill(), put: putSkill, schema: SkillContext, rows: 'skill' },
  ] as const)('PUT/GET /$owner/:id/context', ({ owner, make, put, schema, rows }) => {
    const get = (id: string) => app.inject({ method: 'GET', url: `/${owner}/${id}/context` });
    const stored = async (id: string): Promise<string[]> => {
      const { db } = pg.handle;
      const found =
        rows === 'agent'
          ? await db
              .select({ path: t.agentContextDocs.path, order: t.agentContextDocs.order })
              .from(t.agentContextDocs)
              .where(eq(t.agentContextDocs.agentId, id))
          : await db
              .select({ path: t.skillContextDocs.path, order: t.skillContextDocs.order })
              .from(t.skillContextDocs)
              .where(eq(t.skillContextDocs.skillId, id));
      return found.sort((a, b) => a.order - b.order).map((r) => r.path);
    };

    it('starts empty, stores the paths in the given order and returns them in that order', async () => {
      const id = await make();
      const empty = await get(id);
      expect(empty.statusCode).toBe(200);
      expect(schema.parse(empty.json())).toEqual({ paths: [] });

      const paths = ['specs/e.md', 'docs/a.md', 'docs/d.md', 'docs/b.md'];
      const saved = await put(id, paths);
      expect(saved.statusCode).toBe(200);
      expect(schema.parse(saved.json())).toEqual({ paths });
      expect(schema.parse((await get(id)).json())).toEqual({ paths });
      expect(await stored(id)).toEqual(paths);

      // a new order replaces the old one; a shorter list drops the rest; [] clears
      const reordered = ['docs/b.md', 'specs/e.md', 'docs/a.md'];
      expect(schema.parse((await put(id, reordered)).json())).toEqual({ paths: reordered });
      expect(await stored(id)).toEqual(reordered);
      expect(schema.parse((await put(id, [])).json())).toEqual({ paths: [] });
      expect(await stored(id)).toEqual([]);
    });

    it('stores a path whose file does not exist, so a document deleted later stays attached', async () => {
      const id = await make();
      const res = await put(id, ['docs/not-in-the-clone.md']);
      expect(res.statusCode).toBe(200);
      expect(await stored(id)).toEqual(['docs/not-in-the-clone.md']);
    });

    it('answers 422 for every invalid list and stores nothing', async () => {
      const id = await make();
      const keep = ['docs/a.md', 'docs/b.md'];
      expect((await put(id, keep)).statusCode).toBe(200);

      const tooMany = Array.from({ length: 201 }, (_, i) => `docs/f${i}.md`);
      const invalid: Array<[string, unknown]> = [
        ['201 paths', tooMany],
        ['duplicate', ['docs/a.md', 'docs/a.md']],
        ['parent segment', ['../x.md']],
        ['absolute', ['/a.md']],
        ['leading ./', ['./specs/a.md']],
        ['empty segment', ['specs//a.md']],
        ['dot segment', ['specs/./a.md']],
        ['not markdown', ['docs/a.txt']],
        ['no search root', ['src/a.md']],
        ['one bad among good', ['docs/c.md', 'src/a.md']],
        ['not an array', 'docs/a.md'],
      ];
      for (const [label, paths] of invalid) {
        const res = await put(id, paths);
        expect(res.statusCode, label).toBe(422);
        expect(res.json().error.code, label).toBe('validation_error');
      }
      expect(await stored(id)).toEqual(keep);
      expect(schema.parse((await get(id)).json())).toEqual({ paths: keep });
    });

    it('accepts exactly 200 paths', async () => {
      const id = await make();
      const paths = Array.from({ length: 200 }, (_, i) => `docs/f${String(i).padStart(3, '0')}.md`);
      const res = await put(id, paths);
      expect(res.statusCode).toBe(200);
      expect(schema.parse(res.json()).paths).toEqual(paths);
    });

    it('answers 404 for an unknown or foreign owner on GET and PUT', async () => {
      const foreign = await (owner === 'agents'
        ? newAgent({ workspace: foreignWorkspaceId })
        : newSkill({ workspace: foreignWorkspaceId }));
      for (const id of [UNKNOWN_ID, foreign]) {
        expect((await get(id)).statusCode).toBe(404);
        expect((await put(id, ['docs/a.md'])).statusCode).toBe(404);
      }
      expect(await stored(foreign)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------- side effects

  describe('side effects', () => {
    it('bumps no version and writes no version row when the attachments change', async () => {
      const { db } = pg.handle;
      const agentId = await newAgent();
      const skillId = await newSkill();
      await db.insert(t.agentVersions).values({ agentId, version: 1, configJson: { name: 'v1' } });
      await db.insert(t.skillVersions).values({ skillId, version: 1, body: 'b' });

      expect((await putAgent(agentId, ['docs/a.md', 'docs/b.md'])).statusCode).toBe(200);
      expect((await putSkill(skillId, ['docs/a.md'])).statusCode).toBe(200);
      expect((await putAgent(agentId, ['docs/d.md'])).statusCode).toBe(200);

      const [agent] = await db.select().from(t.agents).where(eq(t.agents.id, agentId));
      const [skill] = await db.select().from(t.skills).where(eq(t.skills.id, skillId));
      expect(agent!.version).toBe(1);
      expect(skill!.version).toBe(1);
      const agentVersions = await db.select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agentId));
      const skillVersions = await db.select().from(t.skillVersions).where(eq(t.skillVersions.skillId, skillId));
      expect(agentVersions.map((v) => v.version)).toEqual([1]);
      expect(skillVersions.map((v) => v.version)).toEqual([1]);
    });

    it('deletes the attachments of an agent and of a skill with their owner, and only theirs', async () => {
      const { db } = pg.handle;
      const agentId = await newAgent();
      const otherAgent = await newAgent();
      const skillId = await newSkill();
      const otherSkill = await newSkill();
      expect((await putAgent(agentId, ['docs/a.md', 'docs/b.md'])).statusCode).toBe(200);
      expect((await putAgent(otherAgent, ['docs/a.md'])).statusCode).toBe(200);
      expect((await putSkill(skillId, ['docs/a.md'])).statusCode).toBe(200);
      expect((await putSkill(otherSkill, ['docs/a.md'])).statusCode).toBe(200);

      expect((await app.inject({ method: 'DELETE', url: `/agents/${agentId}` })).statusCode).toBe(200);
      expect((await app.inject({ method: 'DELETE', url: `/skills/${skillId}` })).statusCode).toBe(200);

      expect(await db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId))).toEqual([]);
      expect(await db.select().from(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId))).toEqual([]);
      expect(
        await db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, otherAgent)),
      ).toHaveLength(1);
      expect(
        await db.select().from(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, otherSkill)),
      ).toHaveLength(1);
    });

    it('stores no document text in any table after listing, previewing and attaching', async () => {
      // the marker is in the mock document specs/alpha.md; drive every route that touches it
      const agentId = await newAgent();
      const skillId = await newSkill();
      const preview = await app.inject({
        method: 'GET',
        url: `/repos/${repoId}/context/file?path=${encodeURIComponent('specs/alpha.md')}`,
      });
      expect(preview.json().content).toContain(MARKER); // the marker really travels through the route
      expect((await app.inject({ method: 'GET', url: `/repos/${repoId}/context` })).statusCode).toBe(200);
      expect((await putAgent(agentId, ['specs/alpha.md'])).statusCode).toBe(200);
      expect((await putSkill(skillId, ['specs/alpha.md'])).statusCode).toBe(200);

      const columns = await pg.handle.sql<{ table_name: string; column_name: string }[]>`
        select table_name, column_name
        from information_schema.columns
        where table_schema = 'public' and data_type in ('text', 'character varying', 'json', 'jsonb')`;
      expect(columns.length).toBeGreaterThan(0);
      expect(columns.some((c) => c.table_name === 'agent_context_docs' && c.column_name === 'path')).toBe(true);

      const scan = async (): Promise<string[]> => {
        const hits: string[] = [];
        for (const { table_name, column_name } of columns) {
          const rows = await pg.handle.sql.unsafe(
            `select 1 from "${table_name}" where "${column_name}"::text like $1 limit 1`,
            [`%${MARKER}%`],
          );
          if (rows.length > 0) hits.push(`${table_name}.${column_name}`);
        }
        return hits;
      };
      expect(await scan()).toEqual([]);

      // the scan is not blind: text that is stored is found
      await pg.handle.db.update(t.agents).set({ description: MARKER }).where(eq(t.agents.id, agentId));
      expect(await scan()).toEqual(['agents.description']);
    });
  });
});
