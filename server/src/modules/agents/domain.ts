import type { Agent, CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';

/**
 * Pure rules for the agents module. No I/O — the config-version-bump rule.
 */

/** Fields whose change bumps the agent's config version (anything but `enabled`). */
export interface ConfigChangePatch {
  name?: string;
  description?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  outputSchema?: unknown;
  strategy?: ReviewStrategy;
  ciFailOn?: CiFailOn;
  repoIntel?: boolean;
}

/**
 * True when a patch changes config (vs. just toggling `enabled`) relative to the
 * existing agent — a config change bumps the version and snapshots agent_versions.
 */
export function isConfigChange(
  existing: Pick<
    Agent,
    'name' | 'description' | 'provider' | 'model' | 'system_prompt' | 'strategy' | 'ci_fail_on' | 'repo_intel'
  >,
  patch: ConfigChangePatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.provider !== undefined && patch.provider !== existing.provider) ||
    (patch.model !== undefined && patch.model !== existing.model) ||
    (patch.systemPrompt !== undefined && patch.systemPrompt !== existing.system_prompt) ||
    (patch.strategy !== undefined && patch.strategy !== existing.strategy) ||
    (patch.ciFailOn !== undefined && patch.ciFailOn !== existing.ci_fail_on) ||
    (patch.repoIntel !== undefined && patch.repoIntel !== existing.repo_intel) ||
    patch.outputSchema !== undefined
  );
}
