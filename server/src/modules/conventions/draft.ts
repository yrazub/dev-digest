import { ConventionCategory, type ConventionSkillDraft } from '@devdigest/shared';
import type { ConventionRecord } from './domain.js';

/**
 * L02 — accepted candidates → the merged skill draft the Create skill modal
 * opens with. Pure. Rules are grouped by category (enum order), then ordered
 * by confidence; each cites its evidence so the reviewer sees a real example.
 */

export const DEFAULT_SKILL_NAME = 'repo-conventions';

const CATEGORY_TITLES: Record<ConventionCategory, string> = {
  naming: 'Naming',
  structure: 'Structure',
  imports: 'Imports',
  'error-handling': 'Error handling',
  typing: 'Typing',
  testing: 'Testing',
  formatting: 'Formatting',
  api: 'API',
  other: 'Other',
};

/** First four words of the rule, kebab-cased: the rule's heading. */
export function ruleSlug(rule: string): string {
  return (
    rule
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .join('-') || 'rule'
  );
}

/** A code fence longer than any backtick run in the snippet, so the snippet cannot close it. */
function fence(snippet: string): string {
  const longest = Math.max(0, ...(snippet.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

function range(r: ConventionRecord): string {
  return r.evidenceLineStart === r.evidenceLineEnd
    ? `${r.evidencePath}:${r.evidenceLineStart}`
    : `${r.evidencePath}:${r.evidenceLineStart}-${r.evidenceLineEnd}`;
}

/** Lower-case kebab slug of the repo name, for the fallback skill name. */
function repoSlug(repoName: string): string {
  return repoName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'repo';
}

/** `repo-conventions`, or `<repo>-conventions` when that name is already a skill. */
export function draftSkillName(repoName: string, taken: (name: string) => boolean): string {
  return taken(DEFAULT_SKILL_NAME) ? `${repoSlug(repoName)}-conventions` : DEFAULT_SKILL_NAME;
}

export function buildSkillDraft(
  name: string,
  repoFullName: string,
  accepted: ConventionRecord[],
): ConventionSkillDraft {
  const sections = ConventionCategory.options.flatMap((category) => {
    const rules = accepted
      .filter((r) => r.category === category)
      .sort((a, b) => b.confidence - a.confidence);
    if (rules.length === 0) return [];
    const blocks = rules.map((r) => {
      const f = fence(r.evidenceSnippet);
      return `### ${ruleSlug(r.rule)}\n\n${r.rule}\n\nDetected in \`${range(r)}\`:\n\n${f}\n${r.evidenceSnippet}\n${f}`;
    });
    return [`## ${CATEGORY_TITLES[category]}\n\n${blocks.join('\n\n')}`];
  });
  const body = [
    `# ${name}`,
    `House conventions for \`${repoFullName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    ...sections,
  ].join('\n\n');
  const count = accepted.length;
  return {
    name,
    description: `${count} house convention${count === 1 ? '' : 's'} extracted from ${repoFullName}`,
    type: 'convention',
    body: `${body}\n`,
  };
}

/** Most evidence paths a skill keeps (`SkillEvidenceFiles`). */
const MAX_EVIDENCE_FILES = 100;

/** Distinct evidence paths, in rule order: the skill's `evidence_files`. */
export function evidenceFiles(accepted: ConventionRecord[]): string[] {
  return [...new Set(accepted.map((r) => r.evidencePath))].slice(0, MAX_EVIDENCE_FILES);
}
