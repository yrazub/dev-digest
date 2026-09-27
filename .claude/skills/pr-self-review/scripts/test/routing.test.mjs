import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPlan } from '../lib/routing.mjs';

const manifest = JSON.parse(readFileSync(new URL('../../routing.json', import.meta.url), 'utf8'));
const installed = Object.keys(manifest.skills).map((name) => ({ name, dir: name }));
const plan = (...paths) => buildPlan({ files: paths.map((p) => ({ path: p, status: 'M' })), manifest, installed });
const skillsOf = (p) => new Set(p.tasks.map((t) => t.skill));

test('a client-only diff gets UI skills and no arch-check', () => {
  const p = plan('client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx');
  const skills = skillsOf(p);
  for (const s of ['frontend-ui-architecture', 'react-best-practices', 'next-best-practices', 'security']) assert.ok(skills.has(s), s);
  for (const s of ['onion-architecture', 'fastify-best-practices', 'drizzle-orm-patterns']) assert.ok(!skills.has(s), s);
  assert.equal(p.arch_check, false);
});

test('a server-only diff gets backend skills and arch-check, no UI skills', () => {
  const p = plan('server/src/modules/pulls/routes.ts', 'server/src/modules/reviews/repository.ts');
  const skills = skillsOf(p);
  for (const s of ['onion-architecture', 'fastify-best-practices', 'drizzle-orm-patterns', 'security']) assert.ok(skills.has(s), s);
  for (const s of ['frontend-ui-architecture', 'react-best-practices', 'next-best-practices']) assert.ok(!skills.has(s), s);
  assert.equal(p.arch_check, true);
});

test('tests go to react-testing-library, not to the blocking architecture skills', () => {
  const p = plan('client/src/app/agents/_components/AgentCard/AgentCard.test.tsx');
  assert.deepEqual([...skillsOf(p)], ['react-testing-library']);
});

test('files no skill covers are reported', () => {
  const p = plan('scripts/dev.sh');
  assert.deepEqual(p.tasks, []);
  assert.deepEqual(p.uncovered_files, ['scripts/dev.sh']);
});

test('a skill missing from routing.json is reported as unrouted', () => {
  const p = buildPlan({ files: [], manifest, installed: [...installed, { name: 'brand-new-skill', dir: 'brand-new-skill' }] });
  assert.deepEqual(p.unrouted_skills, ['brand-new-skill']);
});

test('large diffs are split into batches of max_files', () => {
  const files = Array.from({ length: manifest.defaults.max_files + 1 }, (_, i) => `server/src/modules/x/f${i}.ts`);
  const p = plan(...files);
  const onion = p.tasks.filter((t) => t.skill === 'onion-architecture');
  assert.equal(onion.length, 2);
  assert.deepEqual(onion.map((t) => t.id), ['onion-architecture-1', 'onion-architecture-2']);
});

test('non-blocking skills carry no critical rules', () => {
  const p = plan('server/src/modules/pulls/routes.ts');
  const fastify = p.tasks.find((t) => t.skill === 'fastify-best-practices');
  assert.equal(fastify.can_block, false);
  assert.deepEqual(fastify.critical_rules, []);
});

test('exclusions and globs also match inside dot-folders', async () => {
  const { isExcluded } = await import('../lib/git.mjs');
  assert.ok(isExcluded('.claude/skills/x/SKILL.md', manifest.exclude));
  assert.ok(isExcluded('server/pnpm-lock.yaml', manifest.exclude));
  assert.ok(!isExcluded('.claude/skills/x/routing.json', manifest.exclude));
  assert.ok(!isExcluded('.gitignore', manifest.exclude));
});
