import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ConventionExtractResult, ConventionList } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions-extract] Docker not available — skipping integration tests.');
}

const SERVICE = [
  "import { NotFoundError } from '../errors.js';",
  'export async function getUser(id: string) {',
  '  const user = await repo.find(id);',
  "  if (!user) throw new NotFoundError('User not found');",
  '  return user;',
  '}',
].join('\n');

const ROUTES = ["import { getUser } from './service.js';", 'export const userRoutes = [getUser];'].join('\n');

const FILES = {
  'src/users/service.ts': SERVICE,
  'src/users/routes.ts': ROUTES,
  'tsconfig.json': '{ "compilerOptions": { "strict": true } }',
};

/** Two real candidates, one hallucinated snippet, one path outside the sample. */
const MODEL_OUTPUT = {
  candidates: [
    {
      category: 'error-handling',
      rule: 'Throw NotFoundError when a lookup misses.',
      evidence: { path: 'src/users/service.ts', line: 4, snippet: "if (!user) throw new NotFoundError('User not found');" },
      confidence: 0.92,
    },
    {
      category: 'imports',
      rule: 'Use relative .js import specifiers.',
      evidence: { path: 'src/users/routes.ts', line: 1, snippet: "import { getUser } from './service.js';" },
      confidence: 0.81,
    },
    {
      category: 'naming',
      rule: 'Prefix boolean variables with is.',
      evidence: { path: 'src/users/service.ts', line: 2, snippet: 'const isActive = true;' },
      confidence: 0.7,
    },
    {
      category: 'structure',
      rule: 'Keep controllers in src/controllers.',
      evidence: { path: 'src/controllers/user.ts', line: 1, snippet: 'export class UserController {}' },
      confidence: 0.6,
    },
  ],
};

/**
 * POST /repos/:id/conventions/extract on real Postgres with a stubbed model:
 * sampling reads configs + repo-intel's files with no model call · the model
 * comes from Settings → Models → Conventions · unverifiable candidates are
 * dropped · results persist · ReScan keeps accepted and rejected rows and
 * never re-proposes a rejected rule · 409 for a repo that was never indexed.
 */
d('conventions extract', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let repoId: string;
  let unindexedRepoId: string;
  const samplerCalls: number[] = [];
  const openai = new MockLLMProvider('openai', { structuredBySchema: { conventions: MODEL_OUTPUT } });
  const anthropic = new MockLLMProvider('anthropic', { structuredBySchema: { conventions: MODEL_OUTPUT } });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'api', fullName: 'acme/api' })
      .returning();
    repoId = repo!.id;
    await db
      .insert(t.repoIndexState)
      .values({ repoId, lastIndexedSha: 'abc123', indexerVersion: 1, status: 'full' });
    const [bare] = await db
      .insert(t.repos)
      .values({ workspaceId: ws!.id, owner: 'acme', name: 'web', fullName: 'acme/web' })
      .returning();
    unindexedRepoId = bare!.id;

    const repoIntel = {
      getConventionSamples: async (_id: string, n: number) => {
        samplerCalls.push(n);
        // The sampler runs before any model call.
        expect(openai.calls.length + anthropic.calls.length).toBe(samplerCalls.length - 1);
        return ['src/users/service.ts', 'src/users/routes.ts'];
      },
    } as unknown as RepoIntel;

    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db,
      overrides: {
        git: new MockGitClient({ files: FILES }),
        github: new MockGitHubClient(),
        repoIntel,
        llm: { openai, anthropic },
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const extract = () => app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
  const list = async () =>
    (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json() as ConventionList;

  it('returns no candidates and no scan info before the first scan', async () => {
    const body = await list();
    expect(body).toEqual({ scan: { last_scan_at: null, sampled_files: null }, candidates: [] });
  });

  it('samples configs and code, calls the default model once, keeps only verified candidates', async () => {
    const res = await extract();
    expect(res.statusCode).toBe(200);
    const body = res.json() as ConventionExtractResult;

    expect(samplerCalls).toEqual([12]);
    expect(openai.calls).toHaveLength(1);
    const req = openai.calls[0]!.req as { model: string; messages: { content: string }[] };
    expect(req.model).toBe('gpt-5.4');
    const prompt = req.messages[1]!.content;
    expect(prompt).toContain('<untrusted source="tsconfig.json">');
    expect(prompt).toContain('<untrusted source="src/users/service.ts">');

    expect(body.stats).toMatchObject({ sampled_files: 3, proposed: 4, verified: 2, dropped: 2, model: 'openai/gpt-5.4' });
    expect(body.candidates.map((c) => c.rule)).toEqual([
      'Throw NotFoundError when a lookup misses.',
      'Use relative .js import specifiers.',
    ]);
    expect(body.candidates[0]).toMatchObject({
      status: 'pending',
      evidence_line_start: 4,
      evidence_line_end: 4,
      evidence_url: 'https://github.com/acme/api/blob/abc123/src/users/service.ts#L4',
    });
  });

  it('persists candidates and the scan info', async () => {
    const body = await list();
    expect(body.candidates).toHaveLength(2);
    expect(body.scan.sampled_files).toBe(3);
    expect(body.scan.last_scan_at).not.toBeNull();
  });

  it('accepts, rejects and edits in place', async () => {
    const [first, second] = (await list()).candidates;
    const accepted = await app.inject({ method: 'PATCH', url: `/conventions/${first!.id}`, payload: { status: 'accepted', rule: 'Throw NotFoundError on a missed lookup.' } });
    expect(accepted.json()).toMatchObject({ status: 'accepted', rule: 'Throw NotFoundError on a missed lookup.' });
    const rejected = await app.inject({ method: 'PATCH', url: `/conventions/${second!.id}`, payload: { status: 'rejected' } });
    expect(rejected.json()).toMatchObject({ status: 'rejected' });
    expect((await app.inject({ method: 'PATCH', url: `/conventions/${second!.id}`, payload: {} })).statusCode).toBe(422);
  });

  it('ReScan uses the Settings model, keeps decided rows and does not re-propose the rejected rule', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { feature_models: { conventions: { provider: 'anthropic', model: 'claude-sonnet-5' } } },
    });
    expect(put.statusCode).toBe(200);

    const body = (await extract()).json() as ConventionExtractResult;
    expect(anthropic.calls).toHaveLength(1);
    expect((anthropic.calls[0]!.req as { model: string }).model).toBe('claude-sonnet-5');
    expect(body.stats.model).toBe('anthropic/claude-sonnet-5');

    const byStatus = body.candidates.map((c) => [c.status, c.rule]);
    // The model proposed both rules again: the rejected one by its wording, the
    // accepted one by its original wording at the same evidence. Neither comes back.
    expect(byStatus).toEqual([
      ['accepted', 'Throw NotFoundError on a missed lookup.'],
      ['rejected', 'Use relative .js import specifiers.'],
    ]);
  });

  it('409 for a repo that was never indexed, 404 for an unknown one', async () => {
    const res = await app.inject({ method: 'POST', url: `/repos/${unindexedRepoId}/conventions/extract` });
    expect(res.statusCode).toBe(409);
    const missing = await app.inject({ method: 'GET', url: '/repos/6f1c2a52-6f43-4b8a-9d1e-0c8c7b7f6a11/conventions' });
    expect(missing.statusCode).toBe(404);
  });
});
