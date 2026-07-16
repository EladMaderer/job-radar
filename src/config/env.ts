import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment config, validated once at boot. Import `config` anywhere; if the
 * environment is invalid the process exits with a clear message before any work runs.
 */
const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'required for Telegram alerts'),
  TELEGRAM_CHAT_ID: z.string().min(1, 'required for Telegram alerts'),
  DATABASE_URL: z.string().url('must be a valid postgres connection string'),
  POLL_INTERVAL_MIN: z.coerce.number().int().positive().default(15),
  SCORE_THRESHOLD: z.coerce.number().int().min(0).max(100).default(45),
  // Only used in Phase 3 (LLM scoring). Optional today.
  ANTHROPIC_API_KEY: z.string().optional(),
  // 'telegram' (default) or 'console' — lets the whole pipeline run offline.
  NOTIFIER: z.enum(['telegram', 'console']).default('telegram'),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
