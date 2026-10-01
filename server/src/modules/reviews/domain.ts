import type { RunSummary } from '@devdigest/shared';

/**
 * Pure review-domain rules (no DB / network / framework).
 */

/** Per-severity finding counts, persisted on `agent_runs.findings_by_severity`. */
export type SeverityCounts = NonNullable<RunSummary['findings_by_severity']>;

/** Tally finding severities (CRITICAL / WARNING / SUGGESTION) for one review. */
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.CRITICAL += 1;
    else if (r.severity === 'WARNING') c.WARNING += 1;
    else if (r.severity === 'SUGGESTION') c.SUGGESTION += 1;
  }
  return c;
}

/** A skill as it enters the prompt: identity plus body. */
export interface PromptSkill {
  name: string;
  version: number;
  body: string;
}

/**
 * Render skills as prompt blocks, one per skill, in the given order — the
 * order set on the agent's Skills tab. Each block is headed so the run trace
 * shows every skill separately.
 */
export function renderSkillBlocks(skills: PromptSkill[]): string[] {
  return skills.map((s) => `### ${s.name} (v${s.version})\n${s.body.trim()}`);
}
