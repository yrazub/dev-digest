import { z } from 'zod';
import { DEFAULT_LIMIT } from '../constants.js';
import { noReviewFailure, resolveAgent, resolvePull, runNoReviewFailure } from '../resolve.js';
import { toReviewView } from '../review-view.js';
import { acceptNumericString, ToolFailure, type ToolDef } from '../tool.js';

const inputShape = {
  repo: z.string().describe('owner/name'),
  pr: acceptNumericString(z.number().int().min(1)).describe('pull request number'),
  agent: z.string().describe('agent id or exact name'),
};

export const runAgentOnPr: ToolDef<typeof inputShape> = {
  name: 'run_agent_on_pr',
  description:
    'Run one reviewer agent on a pull request, wait for it to finish, and return its verdict and findings. Starts a paid LLM run; to read a review that already exists, call get_findings instead.',
  inputShape,
  // The only write: it starts a run, and nothing it does deletes or overwrites data.
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async run(args, deps, ctx) {
    // Every lookup comes first: nothing is started when one of them fails.
    const { repo, pull } = await resolvePull(deps.api, args.repo, args.pr);
    const agent = await resolveAgent(deps.api, args.agent);
    const where = `${repo.full_name}#${pull.number}`;

    // A retry after a timeout must not pay twice: join the run of this agent that is still going.
    const before = await deps.api.listRuns(pull.id);
    const inFlight = before.find((run) => run.agent_id === agent.id && run.status === 'running');
    const attached = inFlight !== undefined;
    const runId = inFlight ? inFlight.run_id : (await deps.api.startReview(pull.id, agent.id)).run_id;

    await deps.api.waitForRun(runId, { timeoutMs: deps.config.waitMs, signal: ctx.signal, onEvent: ctx.progress });

    // The client gave up: end the call. The run is not cancelled; it keeps going in the API.
    if (ctx.signal?.aborted) {
      throw new ToolFailure(`The call was cancelled. Run ${runId} was not stopped; read it later with get_findings.`);
    }

    // The final status comes from a second read, never from the end of the stream.
    const run = (await deps.api.listRuns(pull.id)).find((candidate) => candidate.run_id === runId);
    if (run === undefined) throw runNoReviewFailure(runId);

    if (run.status === 'failed' || run.status === 'cancelled') throw noReviewFailure(run, where);

    if (run.status !== 'done') {
      return {
        status: 'running',
        run_id: runId,
        agent: agent.name,
        waited_seconds: Math.round(deps.config.waitMs / 1000),
        next:
          'The review is still running. Do not call run_agent_on_pr again. ' +
          `Call get_findings with repo "${repo.full_name}", pr ${pull.number}, run_id "${runId}" in about 30 seconds.`,
      };
    }

    const review = (await deps.api.listReviews(pull.id)).find(
      (candidate) => candidate.kind === 'review' && candidate.run_id === runId,
    );
    if (review === undefined) throw runNoReviewFailure(runId);

    const view = toReviewView(review, { limit: DEFAULT_LIMIT });
    return attached ? { ...view, attached: true } : view;
  },
};
