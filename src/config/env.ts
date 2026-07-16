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
  // LLM scoring (Phase 3). Optional — without it the scorer falls back to keyword.
  ANTHROPIC_API_KEY: z.string().optional(),
  // Scorer selection. Default is the free keyword scorer — the LLM scorer costs money and must be
  // opted into explicitly with SCORER=llm. `preprocess` maps an empty value (e.g. an unset GitHub
  // Actions variable, which arrives as "") to the default instead of a validation error.
  SCORER: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.enum(['keyword', 'llm']).default('keyword'),
  ),
  // 'telegram' (default) or 'console' — lets the whole pipeline run offline.
  NOTIFIER: z.enum(['telegram', 'console']).default('telegram'),
  // TheirStack (second, market-wide source). Key absent => poll:theirstack is a clear no-op.
  // Free tier bills 1 API credit PER JOB RETURNED, so these knobs are a credit budget:
  THEIRSTACK_API_KEY: z.string().optional(),
  THEIRSTACK_MAX_AGE_DAYS: z.coerce.number().int().positive().default(14), // posted_at sanity cap
  THEIRSTACK_LIMIT: z.coerce.number().int().min(1).max(25).default(25), // free plan caps pages at 25
  THEIRSTACK_MAX_PAGES: z.coerce.number().int().min(1).max(5).default(4), // <=100 jobs/run worst case
  THEIRSTACK_MONTHLY_BUDGET: z.coerce.number().int().positive().default(180), // jobs (~credits)/month
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
