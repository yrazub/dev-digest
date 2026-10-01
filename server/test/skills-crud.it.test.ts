import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import type { FastifyInstance } from 'fastify';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockHttpFetcher } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-crud] Docker not available — skipping integration tests.');
}

const RAW_URL = 'https://raw.githubusercontent.com/o/r/main/semver-discipline/SKILL.md';

/** Build a multipart/form-data body with one file part. */
function multipart(filename: string, data: Uint8Array) {
  const boundary = '----devdigest-test-boundary';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      'Content-Type: application/octet-stream\r\n\r\n',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, Buffer.from(data), tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

/**
 * Skills CRUD, versioning, restore and import through HTTP on real Postgres:
 * create writes v1 · a body edit bumps the version and snapshots it · a
 * metadata edit does not · restore appends · agent_count · 409 on a duplicate
 * name · a row deleted in SQL vanishes from GET /skills (#8) · delete cascades ·
 * multipart .md/.zip import and URL import return drafts and store nothing.
 */
d('skills module', () => {
  let pg: PgFixture;
  let app: FastifyInstance;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        httpFetch: new MockHttpFetcher({ [RAW_URL]: '---\nname: semver-discipline\ndescription: d\n---\nBump major.' }),
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const body = {
    name: 'edge-cases',
    description: 'Flag tests that skip boundary values.',
    type: 'custom',
    body: '# Edge cases\n\nv1 body',
  };

  it('create writes the skill and version 1', async () => {
    const res = await app.inject({ method: 'POST', url: '/skills', payload: body });
    expect(res.statusCode).toBe(201);
    const skill = res.json();
    expect(skill).toMatchObject({ name: 'edge-cases', source: 'manual', version: 1, agent_count: 0, enabled: true });

    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skill.id));
    expect(versions).toHaveLength(1);
    expect(versions[0]!.body).toBe(body.body);
  });

  it('rejects a duplicate name with 409 and a bad name with 422', async () => {
    expect((await app.inject({ method: 'POST', url: '/skills', payload: body })).statusCode).toBe(409);
    const bad = await app.inject({ method: 'POST', url: '/skills', payload: { ...body, name: 'Bad Name' } });
    expect(bad.statusCode).toBe(422);
  });

  it('a body edit bumps the version; a metadata edit does not; restore appends', async () => {
    const created = (await app.inject({ method: 'POST', url: '/skills', payload: { ...body, name: 'versioned' } })).json();

    const meta = await app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { enabled: false, description: 'New' } });
    expect(meta.json()).toMatchObject({ version: 1, enabled: false, description: 'New' });

    const edited = await app.inject({
      method: 'PUT',
      url: `/skills/${created.id}`,
      payload: { body: 'v2 body', version_note: 'Tightened' },
    });
    expect(edited.json()).toMatchObject({ version: 2, body: 'v2 body' });

    const restored = await app.inject({ method: 'POST', url: `/skills/${created.id}/versions/1/restore` });
    expect(restored.json()).toMatchObject({ version: 3, body: body.body });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0]).toMatchObject({ current: true, note: 'Restored from v1' });
    expect(versions[1]).toMatchObject({ current: false, note: 'Tightened' });

    expect((await app.inject({ method: 'POST', url: `/skills/${created.id}/versions/9/restore` })).statusCode).toBe(404);
  });

  it('concurrent body edits serialise into consecutive versions instead of failing', async () => {
    const created = (await app.inject({ method: 'POST', url: '/skills', payload: { ...body, name: 'raced' } })).json();
    const results = await Promise.all(
      ['edit-a', 'edit-b', 'edit-c'].map((b) =>
        app.inject({ method: 'PUT', url: `/skills/${created.id}`, payload: { body: b } }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    const versions = (await app.inject({ method: 'GET', url: `/skills/${created.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([4, 3, 2, 1]);
  });

  it('caps evidence_files', async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `src/f${i}.ts`);
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...body, name: 'too-much-evidence', evidence_files: tooMany },
    });
    expect(res.statusCode).toBe(422);
  });

  it('counts linked agents', async () => {
    const skill = (await app.inject({ method: 'POST', url: '/skills', payload: { ...body, name: 'linked' } })).json();
    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json();
    await app.inject({ method: 'POST', url: `/agents/${agents[0].id}/skills`, payload: { skill_ids: [skill.id] } });
    await app.inject({ method: 'POST', url: `/agents/${agents[1].id}/skills`, payload: { skill_ids: [skill.id] } });

    const got = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
    expect(got.agent_count).toBe(2);
    const listed = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(listed.find((s: { id: string }) => s.id === skill.id).agent_count).toBe(2);

    // Delete cascades links and versions.
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
    const links = await pg.handle.db.select().from(t.agentSkills).where(eq(t.agentSkills.skillId, skill.id));
    expect(links).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(404);
  });

  it('a row deleted directly in SQL disappears from GET /skills (#8)', async () => {
    const skill = (await app.inject({ method: 'POST', url: '/skills', payload: { ...body, name: 'sql-deleted' } })).json();
    const [row] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));
    expect(row?.name).toBe('sql-deleted');

    await pg.handle.db.delete(t.skills).where(eq(t.skills.id, skill.id));
    const listed = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(listed.some((s: { id: string }) => s.id === skill.id)).toBe(false);
  });

  it('imports a .md and a .zip as drafts without storing them', async () => {
    const before = (await app.inject({ method: 'GET', url: '/skills' })).json().length;

    const md = await app.inject({
      method: 'POST',
      url: '/skills/import/file',
      ...multipart('breaking-change.md', strToU8('---\nname: breaking-change\ndescription: d\ntype: rubric\n---\nFlag it.')),
    });
    expect(md.statusCode).toBe(200);
    expect(md.json()).toMatchObject({ name: 'breaking-change', type: 'rubric', source: 'imported_file', ignored_files: [] });

    const zip = zipSync({ 'x/SKILL.md': strToU8('Rule.'), 'x/run.sh': strToU8('echo') });
    const zipped = await app.inject({ method: 'POST', url: '/skills/import/file', ...multipart('x.zip', zip) });
    expect(zipped.json()).toMatchObject({ name: 'x', ignored_files: ['x/run.sh'] });

    const txt = await app.inject({ method: 'POST', url: '/skills/import/file', ...multipart('a.txt', strToU8('x')) });
    expect(txt.statusCode).toBe(422);

    expect((await app.inject({ method: 'GET', url: '/skills' })).json()).toHaveLength(before);
  });

  it('imports from a URL through the fetch port', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/url',
      payload: { url: 'https://github.com/o/r/blob/main/semver-discipline/SKILL.md' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'semver-discipline', source: 'imported_url' });

    const http = await app.inject({ method: 'POST', url: '/skills/import/url', payload: { url: 'http://x.io/a.md' } });
    expect(http.statusCode).toBe(422);
  });

  it('saves an imported draft with its source', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'from-import', description: 'd', type: 'rubric', body: 'b', source: 'imported_file' },
    });
    expect(res.json().source).toBe('imported_file');
  });
});
