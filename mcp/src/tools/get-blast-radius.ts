import { z } from 'zod';
import { toBlastView } from '../blast-view.js';
import { resolvePull } from '../resolve.js';
import { acceptNumericString, type ToolDef } from '../tool.js';

const inputShape = {
  repo: z.string().describe('owner/name'),
  pr: acceptNumericString(z.number().int().min(1)).describe('pull request number'),
};

export const getBlastRadius: ToolDef<typeof inputShape> = {
  name: 'get_blast_radius',
  description:
    'Impact map of a pull request: the symbols declared in its changed files, who calls them (file:line) and the HTTP endpoints and cron jobs in those callers. Call it to see what a change can break. Reads a ready index; no LLM call.',
  inputShape,
  annotations: { readOnlyHint: true },
  async run(args, deps) {
    const { repo, pull } = await resolvePull(deps.api, args.repo, args.pr);
    const blast = await deps.api.getBlastRadius(pull.id);
    return toBlastView({ repo: repo.full_name, pr: pull.number, blast });
  },
};
