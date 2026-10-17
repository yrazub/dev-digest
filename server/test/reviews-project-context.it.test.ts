/**
 * L05 phase 6 — project-context documents in a review run, through `POST /pulls/:id/review`
 * against a real Postgres and the built app. The outside world is replaced through `overrides`:
 * `MockLLMProvider`, an empty `MockSecretsProvider` (so `~/.devdigest/secrets.json` is never
 * read), `MockGitHubClient`, `MockGitClient`, and the clone-file port — `MockCloneFiles`, or
 * `FsCloneFiles` over a `mkdtemp` directory for the working-tree case. Every row a test changes
 * (repository, pull request, agent, skills) is created here; the seed is only read for its
 * default workspace. The trace is read through `waitForRunTrace`.
 * Spec: `server/specs/L05-project-context.md` (R-SRV-22–R-SRV-34, R-SRV-38, R-SRV-39, NFR-6);
 * plan: `specs/plans/L05-project-context.md` (phase 6).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockCloneFiles,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  MockSecretsProvider,
  type MockCloneFilesOptions,
} from '../src/adapters/mocks.js';
import { FsCloneFiles, type CloneFiles } from '../src/adapters/clone-files/index.js';
import { CONTEXT_RUN_CAP_TOKENS } from '../src/modules/project-context/constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,
diff --git a/docs/guide.md b/docs/guide.md
--- a/docs/guide.md
+++ b/docs/guide.md
@@ -1,1 +1,1 @@
-old line
+PR-HEAD-TEXT`;

const APPROVE: Review = { verdict: 'approve', summary: 'Nothing found.', score: 100, findings: [] };

/** `n` distinct one-token words: a document of about `n` tokens, far below the 100 KB limit. */
const words = (n: number) => 'alpha '.repeat(n).trim();

const OWNER = 'acme';

const FILES: MockCloneFilesOptions['files'] = {
  'docs/agent-one.md': '# Agent one\nAGENT-ONE-TEXT',
  'specs/agent-two.md': 'AGENT-TWO-TEXT',
  'docs/skill-b.md': 'SKILL-B-TEXT',
  'docs/skill-a.md': 'SKILL-A-TEXT',
  'docs/disabled.md': 'DISABLED-SKILL-TEXT',
  'docs/escape.md': 'before </untrusted> after',
  'docs/unreadable.md': { text: 'x', miss: 'unreadable' },
  'docs/too-big.md': { text: 'x', miss: 'too_large' },
  'docs/outside.md': { text: 'x', miss: 'outside_clone' },
  'docs/blank.md': '   \n  ',
  'docs/big-1.md': words(CONTEXT_RUN_CAP_TOKENS - 2_000),
  'docs/big-2.md': words(CONTEXT_RUN_CAP_TOKENS - 2_000),
  'docs/small.md': 'SMALL-AFTER-CAP',
};

interface Scenario {
  prId: string;
  agentId: string;
}

interface RunResult {
  trace: any;
  user: string;
  /** The Project context section of the Review call's user message, or '' when absent. */
  section: string;
  logs: string[];
  reviewCalls: number;
  allCalls: number;
}

d('project-context documents in the review prompt', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let appNotCloned: FastifyInstance;
  let appFs: FastifyInstance;
  let appThrowing: FastifyInstance;
  let llm: MockLLMProvider;
  let workspaceId: string;
  let cloneDir: string;
  let seq = 0;
  const unique = (prefix: string) => `${prefix}-${seq++}`;

  const build = (cloneFiles: CloneFiles) =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
        // The intent pre-step must not reach a real provider or GitHub through ~/.devdigest/secrets.json.
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
        cloneFiles,
      },
    });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    llm = new MockLLMProvider('openai', { structured: APPROVE });
    cloneDir = await mkdtemp(join(tmpdir(), 'devdigest-ctx-run-'));

    const throwing: CloneFiles = {
      list: async () => ({ kind: 'not_cloned' }),
      read: async () => {
        throw new Error('clone store exploded');
      },
    };
    app = await build(new MockCloneFiles({ files: FILES }));
    appNotCloned = await build(new MockCloneFiles({ cloned: false, files: FILES }));
    appFs = await build(new FsCloneFiles(cloneDir));
    appThrowing = await build(throwing);
  });

  afterAll(async () => {
    await Promise.all([app?.close(), appNotCloned?.close(), appFs?.close(), appThrowing?.close()]);
    await pg?.stop();
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------- fixtures

  /**
   * A repository, a pull request, an agent with `agentPaths`, and linked skills (in the given
   * order) each with its own paths. Every scenario gets its own rows, so runs do not interfere.
   */
  async function scenario(o: {
    clonePath?: string | null;
    repoName?: string;
    repoIntel?: boolean;
    agentPaths?: string[];
    skills?: { name: string; enabled?: boolean; paths: string[] }[];
  }): Promise<Scenario> {
    const { db } = pg.handle;
    const name = o.repoName ?? unique('ctx-run');
    const [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: OWNER,
        name,
        fullName: `${OWNER}/${name}`,
        clonePath: 'clonePath' in o ? o.clonePath : `/clones/${OWNER}/${name}`,
      })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 7,
        title: 'Add key',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    const [agent] = await db
      .insert(t.agents)
      .values({
        workspaceId,
        name: unique('ctx-run-agent'),
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'Review.',
        repoIntel: o.repoIntel ?? true,
      })
      .returning();

    if (o.agentPaths?.length) {
      await db
        .insert(t.agentContextDocs)
        .values(o.agentPaths.map((path, order) => ({ agentId: agent!.id, path, order })));
    }
    for (const [linkOrder, s] of (o.skills ?? []).entries()) {
      const [skill] = await db
        .insert(t.skills)
        .values({
          workspaceId,
          name: s.name,
          description: 'd',
          type: 'custom',
          source: 'manual',
          body: `BODY-${s.name}`,
          enabled: s.enabled ?? true,
        })
        .returning();
      await db.insert(t.agentSkills).values({ agentId: agent!.id, skillId: skill!.id, order: linkOrder });
      if (s.paths.length) {
        await db
          .insert(t.skillContextDocs)
          .values(s.paths.map((path, order) => ({ skillId: skill!.id, path, order })));
      }
    }
    return { prId: pr!.id, agentId: agent!.id };
  }

  async function run(sc: Scenario, target: FastifyInstance = app): Promise<RunResult> {
    llm.calls.length = 0;
    const res = await target.inject({
      method: 'POST',
      url: `/pulls/${sc.prId}/review`,
      payload: { agentId: sc.agentId },
    });
    expect(res.statusCode).toBeLessThan(300);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, sc.prId, { expected: 1 });
    const trace = await waitForRunTrace(target, runId);
    const reviewCalls = llm.calls.filter(
      (c) => c.method === 'completeStructured' && (c.req as { schemaName: string }).schemaName === 'Review',
    );
    expect(reviewCalls.length).toBeGreaterThan(0);
    const user = (reviewCalls[0]!.req as { messages: { role: string; content: string }[] }).messages.find(
      (m) => m.role === 'user',
    )!.content;
    const start = user.indexOf('## Project context');
    const end = user.indexOf('## Diff to review');
    return {
      trace,
      user,
      section: start === -1 ? '' : user.slice(start, end),
      logs: trace.log
        .map((e: { msg: string }) => e.msg)
        .filter((m: string) => m.startsWith('Project context:')),
      reviewCalls: reviewCalls.length,
      allCalls: llm.calls.length,
    };
  }

  const headings = (section: string) =>
    [...section.matchAll(/^### Document: (.+)$/gm)].map((m) => m[1] as string);

  // ---------------------------------------------------------------- insertion

  it('inserts the agent documents, then the enabled skills documents in link order, once each', async () => {
    const sc = await scenario({
      agentPaths: ['docs/agent-one.md', 'specs/agent-two.md'],
      skills: [
        { name: unique('skill-b'), paths: ['docs/skill-b.md', 'docs/agent-one.md'] },
        { name: unique('skill-a'), paths: ['docs/skill-a.md'] },
      ],
    });
    const out = await run(sc);

    // R-SRV-22, AC-62–AC-66: effective order; the repeated agent-one.md appears once
    expect(headings(out.section)).toEqual([
      'docs/agent-one.md',
      'specs/agent-two.md',
      'docs/skill-b.md',
      'docs/skill-a.md',
    ]);
    for (const text of ['AGENT-ONE-TEXT', 'AGENT-TWO-TEXT', 'SKILL-B-TEXT', 'SKILL-A-TEXT']) {
      expect(out.section).toContain(text);
    }
    expect(out.section.indexOf('AGENT-TWO-TEXT')).toBeLessThan(out.section.indexOf('SKILL-B-TEXT'));
    expect(out.section.indexOf('SKILL-B-TEXT')).toBeLessThan(out.section.indexOf('SKILL-A-TEXT'));
    expect(out.section.match(/AGENT-ONE-TEXT/g)).toHaveLength(1);
  });

  it('leaves out the documents of a disabled skill', async () => {
    const sc = await scenario({
      agentPaths: ['docs/agent-one.md'],
      skills: [
        { name: unique('off'), enabled: false, paths: ['docs/disabled.md'] },
        { name: unique('on'), paths: ['docs/skill-a.md'] },
      ],
    });
    const out = await run(sc);

    expect(headings(out.section)).toEqual(['docs/agent-one.md', 'docs/skill-a.md']);
    expect(out.user).not.toContain('DISABLED-SKILL-TEXT');
    expect(out.trace.prompt_assembly.specs_loaded.map((x: { path: string }) => x.path)).toEqual([
      'docs/agent-one.md',
      'docs/skill-a.md',
    ]);
    expect(out.trace.prompt_assembly.specs_skipped ?? null).toBeNull();
  });

  it('makes no extra model call for attached documents (AC-70)', async () => {
    const plain = await run(await scenario({}));
    const attached = await run(
      await scenario({
        agentPaths: ['docs/agent-one.md', 'specs/agent-two.md'],
        skills: [{ name: unique('sk'), paths: ['docs/skill-a.md'] }],
      }),
    );

    expect(attached.section).not.toBe('');
    expect(plain.section).toBe('');
    expect(attached.reviewCalls).toBe(plain.reviewCalls);
    expect(attached.allCalls).toBe(plain.allCalls);
  });

  it('inserts the documents with repo-intel off (AC-74)', async () => {
    const sc = await scenario({ repoIntel: false, agentPaths: ['docs/agent-one.md'] });
    const out = await run(sc);

    expect(headings(out.section)).toEqual(['docs/agent-one.md']);
    expect(out.section).toContain('AGENT-ONE-TEXT');
    expect(out.trace.prompt_assembly.specs_loaded).toHaveLength(1);
  });

  it('reads the clone working tree, not the pull request head (AC-66)', async () => {
    const repoName = unique('ctx-fs');
    const file = join(cloneDir, OWNER, repoName, 'docs', 'guide.md');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, 'CLONE-WORKING-TREE-TEXT', 'utf8');
    const sc = await scenario({ repoName, agentPaths: ['docs/guide.md'] });
    const out = await run(sc, appFs);

    // the mock diff of the run edits docs/guide.md to PR-HEAD-TEXT; the document is the clone's text
    expect(out.user).toContain('PR-HEAD-TEXT');
    expect(headings(out.section)).toEqual(['docs/guide.md']);
    expect(out.section).toContain('CLONE-WORKING-TREE-TEXT');
    expect(out.section).not.toContain('PR-HEAD-TEXT');
    expect(out.trace.prompt_assembly.specs_loaded[0].text).toBe('CLONE-WORKING-TREE-TEXT');
  });

  // ---------------------------------------------------------------- skips

  it('records every skip reason in the trace and logs one line per document', async () => {
    const sc = await scenario({
      agentPaths: ['docs/unreadable.md', 'docs/agent-one.md', 'docs/not-in-clone.md', 'docs/too-big.md'],
      skills: [{ name: 'skip-skill', paths: ['docs/outside.md', 'docs/blank.md', 'docs/skill-a.md'] }],
    });
    const out = await run(sc);
    const pa = out.trace.prompt_assembly;

    expect(pa.specs_skipped).toEqual([
      { path: 'docs/unreadable.md', origin: 'agent', skill_name: null, reason: 'unreadable' },
      { path: 'docs/not-in-clone.md', origin: 'agent', skill_name: null, reason: 'not_found' },
      { path: 'docs/too-big.md', origin: 'agent', skill_name: null, reason: 'too_large' },
      { path: 'docs/outside.md', origin: 'skill', skill_name: 'skip-skill', reason: 'outside_clone' },
      { path: 'docs/blank.md', origin: 'skill', skill_name: 'skip-skill', reason: 'empty' },
    ]);
    expect(pa.specs_loaded.map((x: { path: string }) => x.path)).toEqual(['docs/agent-one.md', 'docs/skill-a.md']);
    expect(headings(out.section)).toEqual(['docs/agent-one.md', 'docs/skill-a.md']);

    // R-SRV-29, R-SRV-38: one line per inserted document, then one per skipped document, never a step
    expect(out.logs).toHaveLength(7);
    expect(
      out.trace.log.filter((e: { msg: string }) => e.msg.startsWith('Project context:')).map((e: { kind: string }) => e.kind),
    ).toEqual(Array(7).fill('info'));
    expect(out.logs[0]).toMatch(/^Project context: docs\/agent-one\.md · ~\d+ tok \(agent\)$/);
    expect(out.logs[1]).toMatch(/^Project context: docs\/skill-a\.md · ~\d+ tok \(skill skip-skill\)$/);
    expect(out.logs.slice(2)).toEqual([
      'Project context: skipped docs/unreadable.md — unreadable',
      'Project context: skipped docs/not-in-clone.md — not_found',
      'Project context: skipped docs/too-big.md — too_large',
      'Project context: skipped docs/outside.md — outside_clone',
      'Project context: skipped docs/blank.md — empty',
    ]);
  });

  it('skips every document as not_cloned when the repository has no clone path', async () => {
    const sc = await scenario({
      clonePath: null,
      agentPaths: ['docs/agent-one.md'],
      skills: [{ name: unique('sk'), paths: ['docs/skill-a.md'] }],
    });
    const out = await run(sc);

    expect(out.section).toBe('');
    expect(out.trace.prompt_assembly.specs_loaded ?? null).toBeNull();
    expect(out.trace.prompt_assembly.specs_skipped.map((x: { path: string; reason: string }) => [x.path, x.reason])).toEqual([
      ['docs/agent-one.md', 'not_cloned'],
      ['docs/skill-a.md', 'not_cloned'],
    ]);
    expect(out.logs).toEqual([
      'Project context: skipped docs/agent-one.md — not_cloned',
      'Project context: skipped docs/skill-a.md — not_cloned',
    ]);
  });

  it('skips every document as not_cloned when the port cannot find the clone', async () => {
    const sc = await scenario({ agentPaths: ['docs/agent-one.md', 'specs/agent-two.md'] });
    const out = await run(sc, appNotCloned);

    expect(out.section).toBe('');
    expect(out.trace.prompt_assembly.specs_skipped.map((x: { reason: string }) => x.reason)).toEqual([
      'not_cloned',
      'not_cloned',
    ]);
    expect(out.trace.specs_read).toEqual([]);
  });

  it('marks the document that passes the run cap, and every later one, over_cap', async () => {
    const sc = await scenario({ agentPaths: ['docs/big-1.md', 'docs/big-2.md', 'docs/small.md'] });
    const out = await run(sc);
    const pa = out.trace.prompt_assembly;

    expect(pa.specs_loaded.map((x: { path: string }) => x.path)).toEqual(['docs/big-1.md']);
    expect(pa.specs_loaded[0].tokens).toBeLessThanOrEqual(CONTEXT_RUN_CAP_TOKENS);
    expect(pa.specs_skipped.map((x: { path: string; reason: string }) => [x.path, x.reason])).toEqual([
      ['docs/big-2.md', 'over_cap'],
      ['docs/small.md', 'over_cap'],
    ]);
    expect(headings(out.section)).toEqual(['docs/big-1.md']);
    expect(out.user).not.toContain('SMALL-AFTER-CAP');
    expect(out.logs.slice(1)).toEqual([
      'Project context: skipped docs/big-2.md — over_cap',
      'Project context: skipped docs/small.md — over_cap',
    ]);
  });

  // ---------------------------------------------------------------- trace

  it('writes specs_read, specs_loaded with the raw text, specs_tokens and specs_calls', async () => {
    const sc = await scenario({
      agentPaths: ['docs/escape.md', 'docs/agent-one.md'],
      skills: [{ name: 'trace-skill', paths: ['docs/skill-b.md'] }],
    });
    const out = await run(sc);
    const pa = out.trace.prompt_assembly;

    expect(out.trace.specs_read).toEqual(['docs/escape.md', 'docs/agent-one.md', 'docs/skill-b.md']);
    expect(pa.specs_loaded).toEqual([
      expect.objectContaining({ path: 'docs/escape.md', origin: 'agent', skill_name: null, text: FILE_TEXT('docs/escape.md') }),
      expect.objectContaining({ path: 'docs/agent-one.md', origin: 'agent', skill_name: null, text: FILE_TEXT('docs/agent-one.md') }),
      expect.objectContaining({ path: 'docs/skill-b.md', origin: 'skill', skill_name: 'trace-skill', text: 'SKILL-B-TEXT' }),
    ]);
    for (const doc of pa.specs_loaded) expect(doc.tokens).toBeGreaterThan(0);
    expect(pa.specs_skipped ?? null).toBeNull();

    // Q9: the trace keeps the text the engine received; the prompt carries it escaped
    expect(pa.specs_loaded[0].text).toContain('</untrusted>');
    expect(out.section).toContain('before <\\/untrusted> after');

    // the section's own weight, the review calls it was sent with, and the stored section text
    expect(pa.specs).toContain('### Document: docs/escape.md');
    expect(pa.specs_tokens).toBeGreaterThan(0);
    expect(pa.specs_calls).toBe(out.reviewCalls);
  });

  it('writes the nulls and "none attached" when nothing is attached', async () => {
    const out = await run(await scenario({}));
    const pa = out.trace.prompt_assembly;

    expect(out.section).toBe('');
    expect(out.user).not.toContain('## Project context');
    expect(out.logs).toEqual(['Project context: none attached']);
    expect(out.trace.specs_read).toEqual([]);
    expect(pa.specs_loaded ?? null).toBeNull();
    expect(pa.specs_skipped ?? null).toBeNull();
    expect(pa.specs_tokens ?? null).toBeNull();
    expect(pa.specs_calls ?? null).toBeNull();
  });

  it('writes specs_tokens and specs_calls as null when every attached document is skipped', async () => {
    const out = await run(await scenario({ agentPaths: ['docs/not-in-clone.md'] }));
    const pa = out.trace.prompt_assembly;

    expect(out.section).toBe('');
    expect(pa.specs_loaded ?? null).toBeNull();
    expect(pa.specs_skipped).toHaveLength(1);
    expect(pa.specs_tokens ?? null).toBeNull();
    expect(pa.specs_calls ?? null).toBeNull();
    expect(out.logs).toEqual(['Project context: skipped docs/not-in-clone.md — not_found']);
  });

  // ---------------------------------------------------------------- never fails the run

  it('goes on without documents, and says so at info level, when project context throws (NFR-6)', async () => {
    const sc = await scenario({ agentPaths: ['docs/agent-one.md'] });
    const out = await run(sc, appThrowing);

    const runs = await pg.handle.db.select().from(t.agentRuns);
    expect(runs.find((r) => r.prId === sc.prId)?.status).toBe('done');
    expect(out.section).toBe('');
    expect(out.logs).toEqual(['Project context: unavailable (clone store exploded)']);
    expect(out.trace.prompt_assembly.specs_loaded ?? null).toBeNull();
    expect(out.trace.specs_read).toEqual([]);
    const entry = out.trace.log.find((e: { msg: string }) => e.msg.startsWith('Project context: unavailable'));
    expect(entry.kind).toBe('info');
  });
});

/** The raw text of a mock document (a string entry of `FILES`). */
function FILE_TEXT(path: string): string {
  const raw = FILES?.[path];
  if (typeof raw !== 'string') throw new Error(`${path} is not a string entry`);
  return raw;
}
