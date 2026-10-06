import type { SmartDiffRole } from '@devdigest/shared';
import { ROLE_RULES, type RoleRule } from './constants.js';

/**
 * Case-sensitive match of one file name against a pattern whose only wildcard is `*`.
 * Built from string operations, never a `RegExp`: a changed path is author-controlled text.
 */
function matchesName(name: string, pattern: string): boolean {
  if (!pattern.includes('*')) return name === pattern;
  const parts = pattern.split('*');
  const prefix = parts[0] ?? '';
  const suffix = parts[parts.length - 1] ?? '';
  if (name.length < prefix.length + suffix.length) return false;
  if (!name.startsWith(prefix) || !name.endsWith(suffix)) return false;
  let from = prefix.length;
  const end = name.length - suffix.length;
  for (let i = 1; i < parts.length - 1; i++) {
    const part = parts[i] ?? '';
    const at = name.indexOf(part, from);
    if (at < 0 || at + part.length > end) return false;
    from = at + part.length;
  }
  return true;
}

function matchesRule(rule: RoleRule, segments: readonly string[]): boolean {
  const last = segments[segments.length - 1] ?? '';
  if (rule.names.some((pattern) => matchesName(last, pattern))) return true;
  if (segments.length < 2) return false;
  const directories = segments.slice(0, -1);
  if (rule.dirs.some((dir) => directories.includes(dir))) return true;
  return rule.roots.includes(directories[0] ?? '');
}

/** The role of one changed file, from its repository-relative path with `/` separators. */
export function classifyFile(path: string): SmartDiffRole {
  const segments = path.split('/');
  for (const rule of ROLE_RULES) {
    if (matchesRule(rule, segments)) return rule.role;
  }
  return 'core';
}
