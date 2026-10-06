/**
 * File-role classifier (`modules/_shared/file-role/`) — the pure rule that places a changed
 * path in one of the five Smart Diff groups. Hermetic: no app, container, request or double.
 * The table is `server/specs/L03-smart-diff.md` ("Test table"); the three disputed cases are
 * named as such because the rule order, not the path, decides them.
 */
import { describe, it, expect } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from '../src/modules/_shared/file-role/classify.js';
import { ROLE_ORDER, ROLE_RULES } from '../src/modules/_shared/file-role/constants.js';

type Row = readonly [path: string, role: SmartDiffRole];

describe('classifyFile — spec test table', () => {
  const rows: Row[] = [
    // A2: rule 1 (boilerplate) is checked before `e2e/**` (tests)
    ['pnpm-lock.yaml', 'boilerplate'],
    ['server/pnpm-lock.yaml', 'boilerplate'],
    ['e2e/package-lock.json', 'boilerplate'],
    ['server/test/pulls-domain.test.ts', 'tests'],
    ['client/src/a/B.test.tsx', 'tests'],
    ['server/test/x.it.test.ts', 'tests'],
    ['server/src/modules/index.ts', 'wiring'],
    ['client/next.config.mjs', 'wiring'],
    ['server/tsconfig.json', 'wiring'],
    ['.github/workflows/client.yml', 'wiring'],
    ['README.md', 'docs'],
    ['specs/L03-smart-diff.md', 'docs'],
    ['docs/agent-prompts/README.md', 'docs'],
    ['LICENSE', 'docs'],
    ['server/src/modules/pulls/service.ts', 'core'],
    ['client/src/lib/api.ts', 'core'],
    // Q3: accepted consequences of the unchanged patterns
    ['server/package.json', 'core'],
    ['server/src/db/migrations/0013_x.sql', 'core'],
    ['client/src/vendor/ui/nav.ts', 'core'],
    // Q3: only `.claude/**` is wiring, a module's own Markdown stays docs
    ['server/CLAUDE.md', 'docs'],
  ];

  it.each(rows)('%s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  describe('disputed cases (the rule order decides)', () => {
    it('disputed case 1: a snapshot under __tests__ is boilerplate, snapshots before tests', () => {
      expect(classifyFile('src/__tests__/__snapshots__/x.snap')).toBe('boilerplate');
    });

    it('disputed case 2: a Markdown file under .claude/ is wiring, .claude/** before docs', () => {
      expect(classifyFile('.claude/skills/security/SKILL.md')).toBe('wiring');
    });

    it('disputed case 3: e2e/README.md is tests, kept as the task order gives it (e2e/** before docs)', () => {
      expect(classifyFile('e2e/README.md')).toBe('tests');
    });
  });
});

describe('classifyFile — the seeded PR #482 paths', () => {
  it.each<Row>([
    ['src/config.ts', 'core'],
    ['src/middleware/ratelimit.test.ts', 'tests'],
    ['src/api/public/index.ts', 'wiring'],
    ['tsconfig.json', 'wiring'],
    ['README.md', 'docs'],
    ['package-lock.json', 'boilerplate'],
  ])('%s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});

describe('classifyFile — match kinds', () => {
  it.each<Row>([
    ['client/dist/a.js', 'boilerplate'],
    ['server/src/x/__tests__/a.ts', 'tests'],
    ['a/b/c/build/out.js', 'boilerplate'],
    ['a/tests/b/c.ts', 'tests'],
  ])('a directory pattern matches at any depth: %s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it.each<Row>([
    ['packages/e2e/a.ts', 'core'],
    ['src/docs/guide.txt', 'core'],
    ['packages/.github/x.yml', 'core'],
    ['packages/.claude/x.json', 'core'],
  ])('a root pattern matches only from the first segment: %s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it.each<Row>([
    ['vitest.config.ts', 'wiring'],
    ['.env.local', 'wiring'],
    ['docker-compose.dev.yml', 'wiring'],
    ['.eslintrc.cjs', 'wiring'],
    ['tsconfig.build.json', 'wiring'],
    ['Cargo.lock', 'boilerplate'],
    ['app.min.js', 'boilerplate'],
    ['types.generated.ts', 'boilerplate'],
    ['a.spec.ts', 'tests'],
    ['README', 'docs'],
    ['CHANGELOG.txt', 'docs'],
  ])('a name pattern is tested against the last segment: %s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it.each<Row>([
    ['Index.ts', 'core'],
    ['license', 'core'],
    ['Dist/a.js', 'core'],
    ['E2E/a.ts', 'core'],
  ])('matching is case-sensitive: %s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it.each<Row>([
    ['scripts/build', 'core'],
    ['server/test', 'core'],
    ['docs', 'core'],
    ['e2e', 'core'],
  ])('a last segment equal to a directory or root pattern is a file name, not a directory: %s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it('an empty path is core', () => {
    expect(classifyFile('')).toBe('core');
  });
});

describe('ROLE_ORDER and ROLE_RULES', () => {
  it('ROLE_ORDER is the five roles in reading order', () => {
    expect([...ROLE_ORDER]).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
  });

  it('ROLE_RULES lists boilerplate, tests, wiring, docs in checking order and has no core entry', () => {
    expect(ROLE_RULES.map((r) => r.role)).toEqual(['boilerplate', 'tests', 'wiring', 'docs']);
    expect(ROLE_RULES.map((r) => r.role as string)).not.toContain('core');
  });
});

describe('classifyFile — author-controlled paths', () => {
  it('a 4000-character path of repeated `.config` segments classifies within 100 ms', () => {
    const path = '.config/'.repeat(500) + '.config'; // 4 007 characters
    expect(path.length).toBeGreaterThanOrEqual(4000);
    const start = performance.now();
    const role = classifyFile(path);
    const elapsed = performance.now() - start;
    // the last segment is `.config`, which has no `.config.` inside it, so no name pattern matches
    expect(role).toBe('core');
    expect(elapsed).toBeLessThan(100);
  });

  it('a single 4000-character `.config.config…` file name classifies within 100 ms', () => {
    const path = '.config'.repeat(600);
    expect(path.length).toBeGreaterThanOrEqual(4000);
    const start = performance.now();
    const role = classifyFile(path);
    const elapsed = performance.now() - start;
    expect(role).toBe('wiring'); // `*.config.*` matches a name that contains `.config.`
    expect(elapsed).toBeLessThan(100);
  });
});
