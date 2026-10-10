import { MAX_ERROR_TEXT, MAX_LISTED } from './constants.js';
import type { ApiAgent, ApiRepo, ApiRun, DevDigestApi } from './ports.js';
import { sanitizeText, ToolFailure } from './tool.js';

// The lookups every tool starts with: owner/name -> repo, number -> pull request, id or name -> agent.
// A miss is a ToolFailure that lists the valid values, so the caller can correct itself.

/** A string that came from the API or the caller, made safe to quote inside an error text. */
const quote = (text: string): string => sanitizeText(text, MAX_ERROR_TEXT);

/** Trims, drops a leading https://github.com/ and a trailing ".git" or "/" . */
function normalizeRepo(input: string): string {
  return input
    .trim()
    .replace(/^https:\/\/github\.com\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
}

export async function resolveRepo(api: DevDigestApi, repo: string): Promise<ApiRepo> {
  const wanted = normalizeRepo(repo);
  const segments = wanted.split('/');
  if (segments.length !== 2 || segments.some((segment) => segment === '')) {
    throw new ToolFailure(`repo must be "owner/name", for example "acme/payments-api". Got "${quote(repo)}".`);
  }

  const repos = await api.listRepos();
  const found = repos.find((candidate) => candidate.full_name.toLowerCase() === wanted.toLowerCase());
  if (found) return found;

  if (repos.length === 0) {
    throw new ToolFailure('No repository is imported into DevDigest yet. Add one in the DevDigest UI, then retry.');
  }
  const names = repos
    .map((candidate) => quote(candidate.full_name))
    .sort()
    .slice(0, MAX_LISTED)
    .join(', ');
  throw new ToolFailure(
    `Repository "${quote(repo)}" is not imported into DevDigest. Imported repositories: ${names}. ` +
      'Pass one of them exactly, or add the repository in the DevDigest UI first.',
  );
}

export async function resolvePull(
  api: DevDigestApi,
  repo: string,
  pr: number,
): Promise<{ repo: ApiRepo; pull: { id: string; number: number } }> {
  const resolvedRepo = await resolveRepo(api, repo);
  // A pull request without an id has not been stored yet and cannot be addressed.
  const pulls = (await api.listPulls(resolvedRepo.id)).flatMap((pull) =>
    pull.id ? [{ id: pull.id, number: pull.number }] : [],
  );
  const found = pulls.find((pull) => pull.number === pr);
  if (found) return { repo: resolvedRepo, pull: found };

  const numbers = pulls
    .map((pull) => pull.number)
    .sort((a, b) => b - a)
    .slice(0, MAX_LISTED)
    .map((number) => `#${number}`)
    .join(', ');
  const imported = numbers === '' ? 'No pull requests are imported for it yet.' : `Imported pull requests: ${numbers}.`;
  throw new ToolFailure(
    `Pull request #${pr} is not imported for ${quote(resolvedRepo.full_name)}. ${imported} ` +
      `If it is new, open ${quote(resolvedRepo.full_name)} in the DevDigest UI so it is imported, then retry.`,
  );
}

export async function resolveAgent(api: DevDigestApi, agent: string): Promise<ApiAgent> {
  const wanted = agent.trim();
  const agents = await api.listAgents();

  const byId = agents.find((candidate) => candidate.id === wanted);
  if (byId) return byId;

  const byName = agents.filter((candidate) => candidate.name.toLowerCase() === wanted.toLowerCase());
  if (byName.length === 1 && byName[0]) return byName[0];
  if (byName.length > 1) {
    const listed = byName
      .slice(0, MAX_LISTED)
      .map((candidate) => `${quote(candidate.id)} (${quote(candidate.name)})`)
      .join(', ');
    throw new ToolFailure(`"${quote(agent)}" matches ${byName.length} agents. Pass the id instead: ${listed}.`);
  }
  throw new ToolFailure(`Agent "${quote(agent)}" was not found. Call list_agents and pass one of its id values.`);
}

/** A run that finished, or is gone, but left no review behind. */
export function runNoReviewFailure(runId: string): ToolFailure {
  return new ToolFailure(
    `Run ${quote(runId)} finished but its review is no longer stored (it may have been deleted in DevDigest). Call run_agent_on_pr to create a new one.`,
  );
}

/** Why a pull request has no review to show: the state of the run that should have made it. */
export function noReviewFailure(run: ApiRun | undefined, where: string): ToolFailure {
  if (run === undefined) {
    return new ToolFailure(`${where} has no finished review. Call list_agents, then run_agent_on_pr to create one.`);
  }
  const who = `Run ${quote(run.run_id)} (${quote(run.agent_name ?? 'unknown agent')})`;
  switch (run.status) {
    case 'running':
      return new ToolFailure(
        `${who} on ${where} is still running. Call get_findings again with the same arguments in about 30 seconds. Do not start another run.`,
      );
    case 'failed': {
      const error =
        run.error === null || run.error.trim() === ''
          ? 'no error was recorded; the API may have restarted during the run'
          : quote(run.error);
      return new ToolFailure(
        `${who} failed: ${error}. Provider keys are set in DevDigest → Settings. After fixing the cause, call run_agent_on_pr again.`,
      );
    }
    case 'cancelled':
      return new ToolFailure(`${who} was cancelled in DevDigest. Call run_agent_on_pr to start a new one.`);
    case 'done':
      return runNoReviewFailure(run.run_id);
    default:
      return new ToolFailure(`${where} has no finished review. Call list_agents, then run_agent_on_pr to create one.`);
  }
}
