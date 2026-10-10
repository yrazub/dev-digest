import { z } from 'zod';
import { acceptNumericString, ToolFailure, type ToolDef } from '../tool.js';

const inputShape = {
  repo: z.string().describe('owner/name'),
  pr: acceptNumericString(z.number().int().min(1)).describe('pull request number'),
};

// An honest stub: no lookup, no API call, nothing that could be mistaken for data.
export const getBlastRadius: ToolDef<typeof inputShape> = {
  name: 'get_blast_radius',
  description:
    'Impact map of a pull request: the symbols and callers its changes reach. Not implemented yet: always returns an error, never data. Do not estimate the result.',
  inputShape,
  annotations: { readOnlyHint: true },
  async run() {
    throw new ToolFailure(
      'get_blast_radius is not implemented yet in this DevDigest build: no impact data exists. Do not estimate or invent it; tell the user it is unavailable. get_findings still returns the review findings of the pull request.',
    );
  },
};
