import { z } from 'zod';

export const PullRequest = z.object({
  id: z.string(),
  repo_id: z.string(),
  number: z.number().int(),
  title: z.string(),
  state: z.enum(['open', 'merged', 'closed']),
  merged_at: z.string().nullable(),
});
export type PullRequest = z.infer<typeof PullRequest>;
