import { z } from 'zod';
import { ConventionCategory } from '@devdigest/shared';

/**
 * What the classification model returns (criterion #40): category, rule,
 * evidence as file + line (+ the verbatim snippet), and confidence.
 * Module-internal — never sent over the wire. Bounds are enforced after
 * parsing, in `verify.ts`, so the schema stays valid for strict JSON-schema mode.
 */
export const ConventionLlmOutput = z.object({
  candidates: z.array(
    z.object({
      category: ConventionCategory,
      rule: z.string(),
      evidence: z.object({
        path: z.string(),
        line: z.number().int(),
        snippet: z.string(),
      }),
      confidence: z.number(),
    }),
  ),
});
export type ConventionLlmOutput = z.infer<typeof ConventionLlmOutput>;
export type ConventionLlmCandidate = ConventionLlmOutput['candidates'][number];
