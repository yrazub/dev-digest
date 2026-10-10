import type { SmartDiffRole } from '@devdigest/shared';

/**
 * The only place a file-role pattern or the group order is written. `classifyFile` walks `ROLE_RULES`;
 * `buildSmartDiff` lays groups out in `ROLE_ORDER`.
 */

/** Reading order of the groups: the substance first, mechanical output last. */
export const ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

export interface RoleRule {
  role: Exclude<SmartDiffRole, 'core'>;
  /** Tested against the last path segment; `*` is the only wildcard. */
  names: readonly string[];
  /** A segment at any depth, never the last one. */
  dirs: readonly string[];
  /** The first segment of a path that has at least two segments. */
  roots: readonly string[];
}

/** Checking order: the first rule that matches decides the role; no match is `core`. */
export const ROLE_RULES: readonly RoleRule[] = [
  {
    role: 'boilerplate',
    names: ['*.lock', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', '*.snap', '*.generated.*', '*.min.js'],
    dirs: ['dist', 'build', '__snapshots__'],
    roots: [],
  },
  {
    role: 'tests',
    names: ['*.test.ts', '*.test.tsx', '*.it.test.ts', '*.spec.ts'],
    dirs: ['test', 'tests', '__tests__'],
    roots: ['e2e'],
  },
  {
    role: 'wiring',
    names: ['index.ts', 'index.js', '*.config.*', 'tsconfig*.json', '.eslintrc*', '.env*', 'docker-compose*.yml'],
    dirs: [],
    roots: ['.github', '.claude'],
  },
  {
    role: 'docs',
    names: ['*.md', 'README*', 'CHANGELOG*', 'LICENSE'],
    dirs: [],
    roots: ['docs'],
  },
];
