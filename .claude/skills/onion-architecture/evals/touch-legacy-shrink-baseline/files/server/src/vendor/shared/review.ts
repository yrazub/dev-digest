import { z } from 'zod';

export const Severity = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);
export type Severity = z.infer<typeof Severity>;

export const Finding = z.object({
  file: z.string(),
  line: z.number().int(),
  severity: Severity,
  message: z.string(),
});
export type Finding = z.infer<typeof Finding>;

export const SeverityCounts = z.object({ CRITICAL: z.number(), WARNING: z.number(), SUGGESTION: z.number() });
export type SeverityCounts = z.infer<typeof SeverityCounts>;
