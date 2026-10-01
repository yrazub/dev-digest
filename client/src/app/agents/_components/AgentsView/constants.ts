/** Constants for the Agents view. */

/** Quick-start agent templates surfaced in the "Add Agent" dropdown. */
export const TEMPLATES = ["Security", "Performance", "Mentor", "Conformance", "Architecture"] as const;

export type AgentTab = "config" | "skills";

/** Agent editor tabs, in order (#35: exactly Config and Skills). */
export const AGENT_TABS: readonly AgentTab[] = ["config", "skills"];

export function toAgentTab(value: string | null): AgentTab {
  return AGENT_TABS.includes(value as AgentTab) ? (value as AgentTab) : "config";
}
