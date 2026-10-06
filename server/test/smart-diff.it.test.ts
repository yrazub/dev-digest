/**
 * L03 — `GET /pulls/:id/smart-diff` against a real Postgres and the built app (`app.inject`). Every PR
 * here is inserted by the test; the seeded PR #482 is covered by the seed phase, not this file.
 * The outside world is replaced through `overrides`: an empty `MockSecretsProvider` (so
 * `~/.devdigest/secrets.json` is never read), a GitHub double that counts every method call and a
 * `MockLLMProvider`. The route reads Postgres only (B3), so after all requests neither may have
 * recorded a call. No test calls `GET /pulls/:id`: with the GitHub mock it would replace a PR's `pr_files`.
 * Spec: `server/specs/L03-smart-diff.md`; plan: `specs/L03-smart-diff-plan.md` (phase 2).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { SmartDiff } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
const ROLES = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

/** A GitHub double: every method call, of any method, is recorded by name. */
function countingGitHub() {
  const calls: string[] = [];
  const inner = new MockGitHubClient();
  const proxy = new Proxy(inner, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.push(String(prop));
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { github: proxy, calls };
}

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;
  let repoId: string;
  let seq = 1;
  const gh = countingGitHub();
  const llm = new MockLLMProvider('openrouter');

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'smart-diff', fullName: 'acme/smart-diff' })
      .returning();
    repoId = repo!.id;
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { secrets: new MockSecretsProvider(), github: gh.github, llm: { openrouter: llm } },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function insertPull(opts: { workspaceId?: string; repoId?: string } = {}): Promise<string> {
    const number = 1000 + seq++;
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: opts.workspaceId ?? workspaceId,
        repoId: opts.repoId ?? repoId,
        number,
        title: `PR ${number}`,
        author: 'marisa.koch',
        branch: `feat/${number}`,
        base: 'main',
        headSha: `sha${number}`,
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'open',
      })
      .returning();
    return pr!.id;
  }

  const insertFiles = (prId: string, files: [path: string, additions: number, deletions: number][]) =>
    pg.handle.db
      .insert(t.prFiles)
      .values(files.map(([path, additions, deletions]) => ({ prId, path, additions, deletions, patch: 'SECRET PATCH' })));

  async function insertReview(prId: string, agentId: string, createdAt: Date): Promise<string> {
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, kind: 'review', createdAt })
      .returning();
    return review!.id;
  }

  const insertFinding = (reviewId: string, file: string, startLine: number, dismissedAt: Date | null = null) =>
    pg.handle.db.insert(t.findings).values({
      reviewId,
      file,
      startLine,
      endLine: startLine,
      severity: 'WARNING',
      category: 'bug',
      title: `finding ${file}:${startLine}`,
      rationale: 'Because.',
      confidence: 0.9,
      dismissedAt,
    });

  const get = (id: string) => app.inject({ method: 'GET', url: `/pulls/${id}/smart-diff` });
  const fileOf = (diff: SmartDiff, path: string) => diff.groups.flatMap((g) => g.files).find((f) => f.path === path)!;

  it('groups a PR with one file per role and no review, with every finding_lines empty', async () => {
    const prId = await insertPull();
    await insertFiles(prId, [
      ['package-lock.json', 62, 27],
      ['src/middleware/ratelimit.test.ts', 40, 0],
      ['src/config.ts', 4, 0],
      ['README.md', 14, 2],
      ['tsconfig.json', 2, 1],
    ]);

    const res = await get(prId);
    expect(res.statusCode).toBe(200);
    const parsed = SmartDiff.safeParse(res.json());
    expect(parsed.success).toBe(true);
    const body = parsed.data!;

    expect(body.groups.map((g) => g.role)).toEqual(ROLES);
    const paths = (role: string) => body.groups.find((g) => g.role === role)!.files.map((f) => f.path);
    expect(paths('core')).toEqual(['src/config.ts']);
    expect(paths('tests')).toEqual(['src/middleware/ratelimit.test.ts']);
    expect(paths('wiring')).toEqual(['tsconfig.json']);
    expect(paths('docs')).toEqual(['README.md']);
    expect(paths('boilerplate')).toEqual(['package-lock.json']);
    expect(body.groups.flatMap((g) => g.files).every((f) => f.finding_lines.length === 0)).toBe(true);
    expect(fileOf(body, 'package-lock.json')).toMatchObject({ additions: 62, deletions: 27 });
    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: 152, proposed_splits: [] });
    expect(res.body).not.toContain('SECRET PATCH');
  });

  it('sorts the files of a group by path whatever order they were stored in', async () => {
    const prId = await insertPull();
    await insertFiles(prId, [
      ['src/b.ts', 1, 0],
      ['src/Z.ts', 1, 0],
      ['src/a.ts', 1, 0],
    ]);
    const body = SmartDiff.parse((await get(prId)).json());
    expect(body.groups[0]!.files.map((f) => f.path)).toEqual(['src/Z.ts', 'src/a.ts', 'src/b.ts']);
  });

  it('counts the newest review of each agent, without dismissed findings, as distinct ascending lines', async () => {
    const prId = await insertPull();
    await insertFiles(prId, [
      ['src/a.ts', 10, 0],
      ['src/b.ts', 5, 1],
      ['README.md', 2, 0],
    ]);
    const agentA = randomUUID();
    const agentB = randomUUID();

    // agent A, older: a line (5) the newer review lacks
    const older = await insertReview(prId, agentA, minutesAgo(30));
    await insertFinding(older, 'src/a.ts', 5);
    await insertFinding(older, 'src/a.ts', 20);

    // agent B, one review
    const other = await insertReview(prId, agentB, minutesAgo(20));
    await insertFinding(other, 'src/a.ts', 2);
    await insertFinding(other, 'README.md', 1);

    // agent A, newest: a repeated line, a dismissed finding and a finding for a file outside the PR
    const newer = await insertReview(prId, agentA, minutesAgo(10));
    await insertFinding(newer, 'src/a.ts', 20);
    await insertFinding(newer, 'src/a.ts', 20);
    await insertFinding(newer, 'src/a.ts', 8);
    await insertFinding(newer, 'src/a.ts', 30, new Date());
    await insertFinding(newer, 'src/b.ts', 3);
    await insertFinding(newer, 'src/not-in-the-pr.ts', 4);

    const res = await get(prId);
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());

    expect(fileOf(body, 'src/a.ts').finding_lines).toEqual([2, 8, 20]);
    expect(fileOf(body, 'src/b.ts').finding_lines).toEqual([3]);
    expect(fileOf(body, 'README.md').finding_lines).toEqual([1]);
    expect(body.groups.flatMap((g) => g.files.map((f) => f.path))).not.toContain('src/not-in-the-pr.ts');
    expect(body.split_suggestion.total_lines).toBe(18);
  });

  it('answers 200 with five empty groups for a PR whose files were never stored', async () => {
    const prId = await insertPull();
    const res = await get(prId);
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(ROLES);
    expect(body.groups.every((g) => g.files.length === 0)).toBe(true);
    expect(body.split_suggestion.total_lines).toBe(0);
  });

  it('answers 404 not_found for an unknown uuid', async () => {
    const res = await get(randomUUID());
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('answers 422 for an id that is not a uuid', async () => {
    const res = await get('not-a-uuid');
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
  });

  it('answers 404 for a PR that belongs to another workspace', async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-workspace' }).returning();
    const [otherRepo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: other!.id, owner: 'other', name: 'repo', fullName: 'other/repo' })
      .returning();
    const prId = await insertPull({ workspaceId: other!.id, repoId: otherRepo!.id });
    await insertFiles(prId, [['src/a.ts', 1, 0]]);

    const res = await get(prId);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  // Keep last: it asserts over every request the tests above made.
  it('made no GitHub call and no model call in any request (B3)', () => {
    expect(gh.calls).toEqual([]);
    expect(llm.calls).toEqual([]);
  });
});
