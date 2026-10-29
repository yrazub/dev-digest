import { z } from 'zod';

export const Severity = z.enum(['CRITICAL', 'WARNING']);
export type Severity = z.infer<typeof Severity>;
