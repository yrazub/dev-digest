import { MAX_AGENTS, MAX_DESCRIPTION } from '../constants.js';
import { cutText, type ToolDef } from '../tool.js';

const inputShape = {};

export const listAgents: ToolDef<typeof inputShape> = {
  name: 'list_agents',
  description:
    "List the reviewer agents configured in DevDigest. Call it when you need an agent's id or exact name for run_agent_on_pr.",
  inputShape,
  annotations: { readOnlyHint: true },
  async run(_args, deps) {
    const agents = (await deps.api.listAgents()).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    if (agents.length === 0) {
      return { agents: [], note: 'No agents are configured. Create one in the DevDigest UI (Agents).' };
    }

    const shown = agents.slice(0, MAX_AGENTS).map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: cutText(agent.description, MAX_DESCRIPTION),
      model: `${agent.provider}/${agent.model}`,
      enabled: agent.enabled,
    }));
    return agents.length > shown.length
      ? { agents: shown, note: `Showing the first ${shown.length} of ${agents.length} agents, sorted by name.` }
      : { agents: shown };
  },
};
