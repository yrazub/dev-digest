import { ConventionStatus } from '@devdigest/shared';
import { z } from 'zod';
import { MAX_CONVENTIONS, MAX_PATH, MAX_RULE } from '../constants.js';
import type { ApiConvention } from '../ports.js';
import { resolveRepo } from '../resolve.js';
import { sanitizeText, type ToolDef } from '../tool.js';

const inputShape = {
  repo: z.string().describe('owner/name'),
  // `rejected` is a state of the review in the UI, not something to hand to a model.
  status: ConventionStatus.exclude(['rejected']).default('accepted'),
};

const SCAN_HINT = 'Skills Lab → Conventions';

function evidence(convention: ApiConvention): string {
  const { evidence_line_start: start, evidence_line_end: end } = convention;
  const path = sanitizeText(convention.evidence_path, MAX_PATH);
  return end === start ? `${path}:${start}` : `${path}:${start}-${end}`;
}

export const getConventions: ToolDef<typeof inputShape> = {
  name: 'get_conventions',
  description:
    'Return the coding conventions DevDigest extracted from a repository and the user accepted. Call it before writing or reviewing code in that repository.',
  inputShape,
  annotations: { readOnlyHint: true },
  async run(args, deps) {
    const repo = await resolveRepo(deps.api, args.repo);
    const { scan, candidates } = await deps.api.getConventions(repo.id);

    const matching = candidates.filter((candidate) => candidate.status === args.status);
    const shown = matching.slice(0, MAX_CONVENTIONS);

    let note: string | undefined;
    if (matching.length > shown.length) {
      note = `Showing the first ${shown.length} of ${matching.length} conventions.`;
    } else if (matching.length === 0) {
      const pending = candidates.filter((candidate) => candidate.status === 'pending').length;
      if (candidates.length === 0 && scan.last_scan_at === null) {
        note = `This repository has not been scanned for conventions. Run a scan in DevDigest (${SCAN_HINT}), accept the rules that are right, then call get_conventions again.`;
      } else if (args.status === 'accepted' && pending > 0) {
        note = `No accepted conventions yet; ${pending} candidates are pending review in DevDigest (${SCAN_HINT}). Call get_conventions with status "pending" to read them as unconfirmed proposals.`;
      } else {
        note = `No ${args.status} conventions for this repository. Review the extracted rules in DevDigest (${SCAN_HINT}).`;
      }
    }

    return {
      repo: repo.full_name,
      status: args.status,
      conventions: shown.map((candidate) => ({
        category: candidate.category,
        rule: sanitizeText(candidate.rule, MAX_RULE),
        evidence: evidence(candidate),
      })),
      last_scan_at: scan.last_scan_at,
      ...(note === undefined ? {} : { note }),
    };
  },
};
