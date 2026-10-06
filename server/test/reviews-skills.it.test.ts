import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns, waitForRunTrace } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const APPROVE: Review = { verdict: 'approve', summary: 'Nothing found.', score: 100, findings: [] };

/**
 * L02 — skills reach the review prompt: linked + enabled skills are injected in
 * link order (#14), a reorder flips them, a disabled or unlinked skill leaves no
 * trace (#20), and the trace records the skills block's token count and the
 * loaded skills (#19).
 */
d('skills in the review prompt', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let llm: MockLLMProvider;
  let workspaceId: string;
  let prId: string;
  let agentId: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    llm = new MockLLMProvider('openai', { structured: APPROVE });
    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: llm },
        // The intent pre-step must not reach a real provider or GitHub through ~/.devdigest/secrets.json.
        secrets: new MockSecretsProvider(),
        github: new MockGitHubClient(),
      },
    });

    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'skills-api', fullName: 'acme/skills-api' })
      .returning();
    const [pr] = await pg.handle.db
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
    prId = pr!.id;
    await pg.handle.db.insert(t.prFiles).values({
      prId,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Skilled', provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review.' },
      })
    ).json().id;

    for (const name of ['alpha-rule', 'beta-rule', 'disabled-rule']) {
      const skill = await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name, description: 'd', type: 'custom', body: `BODY-${name}` },
      });
      ids[name] = skill.json().id;
    }
    await app.inject({ method: 'PUT', url: `/skills/${ids['disabled-rule']}`, payload: { enabled: false } });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function runAndTrace() {
    llm.calls.length = 0;
    await pg.handle.db.delete(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    const trace = await waitForRunTrace(app, runId);
    // The intent pre-step can make an earlier structured call; the prompt under test is the Review call's.
    const call = llm.calls.find(
      (c) => c.method === 'completeStructured' && (c.req as { schemaName: string }).schemaName === 'Review',
    )!;
    const user = (call.req as { messages: { role: string; content: string }[] }).messages.find(
      (m) => m.role === 'user',
    )!.content;
    return { trace, user };
  }

  it('without linked skills the slot is empty and the log says so', async () => {
    const { trace, user } = await runAndTrace();
    expect(user).not.toContain('## Skills / rules');
    expect(trace.prompt_assembly.skills).toBeNull();
    expect(trace.prompt_assembly.skills_tokens ?? null).toBeNull();
    expect(trace.log.some((e: { msg: string }) => e.msg === 'Skills: none linked')).toBe(true);
  });

  it('injects linked + enabled skills in link order; a disabled one leaves no trace', async () => {
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [ids['beta-rule'], ids['disabled-rule'], ids['alpha-rule']] },
    });
    const { trace, user } = await runAndTrace();

    expect(user).toContain('## Skills / rules');
    expect(user.indexOf('BODY-beta-rule')).toBeLessThan(user.indexOf('BODY-alpha-rule'));
    expect(user).not.toContain('BODY-disabled-rule');

    expect(trace.prompt_assembly.skills).toContain('### beta-rule (v1)');
    expect(trace.prompt_assembly.skills_tokens).toBeGreaterThan(0);
    expect(trace.prompt_assembly.skills_loaded).toEqual([
      { name: 'beta-rule', version: 1 },
      { name: 'alpha-rule', version: 1 },
    ]);
    const skillLogs = trace.log.filter((e: { msg: string }) => e.msg.startsWith('Skill: ')).map((e: { msg: string }) => e.msg);
    expect(skillLogs).toHaveLength(2);
    expect(skillLogs[0]).toMatch(/^Skill: beta-rule v1 · ~\d+ tok$/);
  });

  it('reordering on the agent flips the prompt order (#14)', async () => {
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [ids['alpha-rule'], ids['beta-rule']] },
    });
    const { trace, user } = await runAndTrace();
    expect(user.indexOf('BODY-alpha-rule')).toBeLessThan(user.indexOf('BODY-beta-rule'));
    expect(trace.prompt_assembly.skills_loaded.map((s: { name: string }) => s.name)).toEqual([
      'alpha-rule',
      'beta-rule',
    ]);
  });
});
