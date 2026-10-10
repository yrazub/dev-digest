/**
 * L03 — smart-diff rules (`modules/smart-diff/domain.ts`): `countedFindings` picks the findings that
 * count (newest review of each agent, dismissed ones dropped) and `buildSmartDiff` lays a PR's files
 * out in five role groups. Hermetic: pure functions, no app, container or double.
 * Spec: `server/specs/L03-smart-diff.md` ("Building the response"); plan: `specs/L03-smart-diff-plan.md` (phase 2).
 */
import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { ROLE_ORDER } from '../src/modules/_shared/file-role/constants.js';
import {
  buildSmartDiff,
  countedFindings,
  type ChangedFile,
  type FindingRef,
  type ReviewFindings,
} from '../src/modules/smart-diff/domain.js';

const file = (path: string, additions = 1, deletions = 0): ChangedFile => ({ path, additions, deletions });
const ref = (path: string, startLine: number, dismissedAt: Date | null = null): FindingRef => ({
  file: path,
  startLine,
  dismissedAt,
});
const review = (agentId: string | null, createdAt: string, findings: FindingRef[]): ReviewFindings => ({
  agentId,
  createdAt: new Date(createdAt),
  findings,
});

const groupFor = (diff: SmartDiff, role: string) => diff.groups.find((g) => g.role === role)!;

describe('buildSmartDiff — groups', () => {
  it('answers five empty groups in ROLE_ORDER for an empty file list', () => {
    const diff = buildSmartDiff([], []);
    expect(diff.groups.map((g) => g.role)).toEqual([...ROLE_ORDER]);
    expect(diff.groups.every((g) => g.files.length === 0)).toBe(true);
    expect(diff.groups.every((g) => Array.isArray(g.files))).toBe(true);
  });

  it('places each file in the group classifyFile gives it', () => {
    const diff = buildSmartDiff(
      [
        file('src/config.ts'),
        file('src/middleware/ratelimit.test.ts'),
        file('tsconfig.json'),
        file('README.md'),
        file('package-lock.json'),
      ],
      [],
    );
    const paths = (role: string) => groupFor(diff, role).files.map((f) => f.path);
    expect(paths('core')).toEqual(['src/config.ts']);
    expect(paths('tests')).toEqual(['src/middleware/ratelimit.test.ts']);
    expect(paths('wiring')).toEqual(['tsconfig.json']);
    expect(paths('docs')).toEqual(['README.md']);
    expect(paths('boilerplate')).toEqual(['package-lock.json']);
  });

  it('sorts the files of a group by path in code-unit order, uppercase before lowercase', () => {
    const diff = buildSmartDiff(
      [file('src/b.ts'), file('src/a.ts'), file('src/Zeta.ts'), file('src/Alpha.ts'), file('lib/c.ts')],
      [],
    );
    expect(groupFor(diff, 'core').files.map((f) => f.path)).toEqual([
      'lib/c.ts',
      'src/Alpha.ts',
      'src/Zeta.ts',
      'src/a.ts',
      'src/b.ts',
    ]);
  });

  it('copies additions and deletions into the file entry and leaves pseudocode_summary out', () => {
    const diff = buildSmartDiff([file('src/a.ts', 7, 2)], []);
    const entry = groupFor(diff, 'core').files[0]!;
    expect(entry).toEqual({ path: 'src/a.ts', additions: 7, deletions: 2, finding_lines: [] });
    expect('pseudocode_summary' in entry).toBe(false);
  });

  it('builds a body that parses with the SmartDiff contract', () => {
    const diff = buildSmartDiff([file('src/a.ts', 3, 1), file('README.md')], [ref('src/a.ts', 4)]);
    expect(SmartDiff.safeParse(diff).success).toBe(true);
  });
});

describe('buildSmartDiff — finding_lines', () => {
  it('lists the distinct start lines of the findings of the file, ascending', () => {
    const diff = buildSmartDiff(
      [file('src/a.ts'), file('src/b.ts')],
      [ref('src/a.ts', 45), ref('src/a.ts', 12), ref('src/a.ts', 45), ref('src/a.ts', 3), ref('src/b.ts', 9)],
    );
    const lines = (path: string) => groupFor(diff, 'core').files.find((f) => f.path === path)!.finding_lines;
    expect(lines('src/a.ts')).toEqual([3, 12, 45]);
    expect(lines('src/b.ts')).toEqual([9]);
  });

  it('sorts lines numerically, not as text', () => {
    const diff = buildSmartDiff([file('src/a.ts')], [ref('src/a.ts', 100), ref('src/a.ts', 9), ref('src/a.ts', 20)]);
    expect(groupFor(diff, 'core').files[0]!.finding_lines).toEqual([9, 20, 100]);
  });

  it('ignores a finding for a file that is not in the PR', () => {
    const diff = buildSmartDiff([file('src/a.ts')], [ref('src/elsewhere.ts', 5), ref('src/a.ts', 2)]);
    expect(diff.groups.flatMap((g) => g.files.map((f) => f.path))).toEqual(['src/a.ts']);
    expect(groupFor(diff, 'core').files[0]!.finding_lines).toEqual([2]);
  });
});

describe('buildSmartDiff — split_suggestion', () => {
  it('carries the sum of additions and deletions over all files and is never too big', () => {
    const diff = buildSmartDiff([file('src/a.ts', 247, 38), file('README.md', 14, 2), file('x.lock', 62, 27)], []);
    expect(diff.split_suggestion).toEqual({ too_big: false, total_lines: 390, proposed_splits: [] });
  });

  it('is zero lines for no files', () => {
    expect(buildSmartDiff([], []).split_suggestion.total_lines).toBe(0);
  });
});

describe('countedFindings', () => {
  it('keeps only the newest review of each agent', () => {
    const counted = countedFindings([
      review('agent-a', '2026-06-02T10:00:00Z', [ref('src/a.ts', 2)]),
      review('agent-a', '2026-06-01T10:00:00Z', [ref('src/a.ts', 1)]),
    ]);
    expect(counted.map((f) => f.startLine)).toEqual([2]);
  });

  it('picks the newest by createdAt whatever the input order', () => {
    const counted = countedFindings([
      review('agent-a', '2026-06-01T10:00:00Z', [ref('src/a.ts', 1)]),
      review('agent-a', '2026-06-02T10:00:00Z', [ref('src/a.ts', 2)]),
    ]);
    expect(counted.map((f) => f.startLine)).toEqual([2]);
  });

  it('treats two reviews with a null agentId as one agent', () => {
    const counted = countedFindings([
      review(null, '2026-06-02T10:00:00Z', [ref('src/a.ts', 2)]),
      review(null, '2026-06-01T10:00:00Z', [ref('src/a.ts', 1)]),
    ]);
    expect(counted.map((f) => f.startLine)).toEqual([2]);
  });

  it('keeps one review per agent when a batch ran several agents', () => {
    const counted = countedFindings([
      review('agent-a', '2026-06-02T10:00:00Z', [ref('src/a.ts', 2)]),
      review('agent-b', '2026-06-02T10:00:01Z', [ref('src/b.ts', 7)]),
      review(null, '2026-06-02T10:00:02Z', [ref('src/c.ts', 9)]),
      review('agent-a', '2026-06-01T10:00:00Z', [ref('src/a.ts', 1)]),
    ]);
    expect(counted.map((f) => `${f.file}:${f.startLine}`).sort()).toEqual(['src/a.ts:2', 'src/b.ts:7', 'src/c.ts:9']);
  });

  it('drops dismissed findings and keeps the rest of the same review', () => {
    const counted = countedFindings([
      review('agent-a', '2026-06-02T10:00:00Z', [
        ref('src/a.ts', 1, new Date('2026-06-03T00:00:00Z')),
        ref('src/a.ts', 2),
      ]),
    ]);
    expect(counted.map((f) => f.startLine)).toEqual([2]);
  });

  it('does not fall back to an older review when the newest has no findings', () => {
    const counted = countedFindings([
      review('agent-a', '2026-06-02T10:00:00Z', []),
      review('agent-a', '2026-06-01T10:00:00Z', [ref('src/a.ts', 1)]),
    ]);
    expect(counted).toEqual([]);
  });

  it('lets the review earlier in the input win when two reviews of one agent share createdAt', () => {
    const counted = countedFindings([
      review('agent-a', '2026-06-02T10:00:00Z', [ref('src/a.ts', 5)]),
      review('agent-a', '2026-06-02T10:00:00Z', [ref('src/a.ts', 6)]),
    ]);
    expect(counted.map((f) => f.startLine)).toEqual([5]);
  });

  it('is empty for no reviews', () => {
    expect(countedFindings([])).toEqual([]);
  });

  it('feeds buildSmartDiff so that a dismissed or superseded finding leaves no line', () => {
    const diff = buildSmartDiff(
      [file('src/a.ts')],
      countedFindings([
        review('agent-a', '2026-06-02T10:00:00Z', [ref('src/a.ts', 20), ref('src/a.ts', 30, new Date())]),
        review('agent-a', '2026-06-01T10:00:00Z', [ref('src/a.ts', 10)]),
      ]),
    );
    expect(groupFor(diff, 'core').files[0]!.finding_lines).toEqual([20]);
  });
});
