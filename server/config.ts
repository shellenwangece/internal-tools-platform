import { z } from 'zod';

const configSchema = z.object({
  DEVIN_API_KEY: z.string().optional(),
  DEVIN_ORG_ID: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_OWNER: z.string().default('shellenwangece'),
  TEMPLATE_REPO: z.string().default('shellenwangece/itp-app-template'),
  DEVIN_MAX_ACU: z.coerce.number().int().positive().default(15),
  SESSION_SECRET: z.string().default('local-demo-session-secret-change-me'),
  DEVIN_MOCK: z.enum(['0', '1']).default('0'),
  GITHUB_MOCK: z.enum(['0', '1']).default('0'),
  BUILD_MODE: z.enum(['docker', 'local']).default('docker'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return configSchema.parse(env);
}
