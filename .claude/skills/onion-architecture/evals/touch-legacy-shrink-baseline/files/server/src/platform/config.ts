import { z } from 'zod';

const Config = z.object({
  DATABASE_URL: z.string(),
  GITHUB_TOKEN: z.string().optional(),
  PORT: z.coerce.number().default(3001),
});
export type Config = z.infer<typeof Config>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return Config.parse(env);
}
