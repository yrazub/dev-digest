/**
 * Agents-domain rule (`modules/agents/domain.ts`) — which patches count as a config
 * change (bump the version, snapshot `agent_versions`) and which do not (`enabled`).
 * The `existing` argument is the `Agent` contract (snake_case), not a Drizzle row.
 */
import { describe, it, expect } from 'vitest';
import { isConfigChange } from '../src/modules/agents/domain.js';

const existing = {
  name: 'Reviewer',
  description: 'Reviews diffs',
  provider: 'openai' as const,
  model: 'gpt-4o-mini',
  system_prompt: 'Review the diff.',
  strategy: 'single-pass' as const,
  ci_fail_on: 'never' as const,
  repo_intel: false,
};

describe('isConfigChange', () => {
  it('is false for an empty patch', () => {
    expect(isConfigChange(existing, {})).toBe(false);
  });

  it('is true when system_prompt differs (compared against the snake_case contract field)', () => {
    expect(isConfigChange(existing, { systemPrompt: 'Review harder.' })).toBe(true);
  });

  it('is true when ci_fail_on differs', () => {
    expect(isConfigChange(existing, { ciFailOn: 'critical' })).toBe(true);
  });

  it('is true when repo_intel differs, in both directions', () => {
    expect(isConfigChange(existing, { repoIntel: true })).toBe(true);
    expect(isConfigChange({ ...existing, repo_intel: true }, { repoIntel: false })).toBe(true);
  });

  it('is false when the patch repeats the existing values', () => {
    expect(
      isConfigChange(existing, {
        name: existing.name,
        description: existing.description,
        provider: existing.provider,
        model: existing.model,
        systemPrompt: existing.system_prompt,
        strategy: existing.strategy,
        ciFailOn: existing.ci_fail_on,
        repoIntel: existing.repo_intel,
      }),
    ).toBe(false);
  });

  it('is true for any output schema in the patch', () => {
    expect(isConfigChange(existing, { outputSchema: { type: 'object' } })).toBe(true);
  });
});
