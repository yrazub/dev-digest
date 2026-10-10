import { Severity } from '@devdigest/shared';
import { z } from 'zod';
import { DEFAULT_LIMIT, MAX_ERROR_TEXT, MAX_LIMIT } from '../constants.js';
import { noReviewFailure, resolvePull } from '../resolve.js';
import { toReviewView } from '../review-view.js';
import { acceptNumericString, sanitizeText, ToolFailure, type ToolDef } from '../tool.js';

const inputShape = {
  repo: z.string().describe('owner/name'),
  pr: acceptNumericString(z.number().int().min(1)).describe('pull request number'),
  run_id: z.string().optional().describe('run to read; default: latest review'),
  min_severity: Severity.optional(),
  limit: acceptNumericString(z.number().int().min(1).max(MAX_LIMIT)).default(DEFAULT_LIMIT),
};

export const getFindings: ToolDef<typeof inputShape> = {
  name: 'get_findings',
  description:
    'Return the verdict and findings of a finished review of a pull request: the latest one, or the run given by run_id. Never starts a review.',
  inputShape,
  annotations: { readOnlyHint: true },
  async run(args, deps) {
    const { repo, pull } = await resolvePull(deps.api, args.repo, args.pr);
    const where = `${repo.full_name}#${pull.number}`;

    // Newest first. A `summary` review is the PR overview, not an agent's verdict.
    const reviews = (await deps.api.listReviews(pull.id)).filter((review) => review.kind === 'review');
    const review = args.run_id === undefined ? reviews[0] : reviews.find((candidate) => candidate.run_id === args.run_id);
    if (review) return toReviewView(review, { minSeverity: args.min_severity, limit: args.limit });

    // No review: the run list says why.
    const runs = await deps.api.listRuns(pull.id);
    if (args.run_id === undefined) throw noReviewFailure(runs[0], where);

    const run = runs.find((candidate) => candidate.run_id === args.run_id);
    if (run === undefined) {
      throw new ToolFailure(
        `Run ${sanitizeText(args.run_id, MAX_ERROR_TEXT)} does not belong to ${where}. Omit run_id to read the latest review of this pull request.`,
      );
    }
    throw noReviewFailure(run, where);
  },
};
