import 'dotenv/config';
import { z } from 'zod';

/**
 * Treat an empty value as unset so the schema default applies. An unset GitHub Actions secret or
 * variable arrives as "" — and `z.coerce.number()` turns "" into 0, silently replacing a default.
 */
const emptyAsUnset = (v: unknown): unknown => (v === '' || v == null ? undefined : v);

/**
 * Environment config, validated once at boot. Import `config` anywhere; if the
 * environment is invalid the process exits with a clear message before any work runs.
 */
const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'required for Telegram alerts'),
  TELEGRAM_CHAT_ID: z.string().min(1, 'required for Telegram alerts'),
  DATABASE_URL: z.string().url('must be a valid postgres connection string'),
  POLL_INTERVAL_MIN: z.coerce.number().int().positive().default(15),
  // Alert only at or above this score. Unset in CI => the default (was silently 0 before emptyAsUnset).
  SCORE_THRESHOLD: z.preprocess(emptyAsUnset, z.coerce.number().int().min(0).max(100).default(50)),
  // LLM scoring (Phase 3). Optional — without it the scorer falls back to keyword.
  ANTHROPIC_API_KEY: z.string().optional(),
  // Hard ceiling on LLM scoring calls per run — a money circuit-breaker. A normal re-baseline
  // needs a few hundred; past this cap, remaining jobs fall back to the free keyword scorer
  // (logged) so a misbehaving board or a runaway discovery can never spend credits unbounded.
  MAX_LLM_SCORES_PER_RUN: z.coerce.number().int().positive().default(1500),
  // Scorer selection. Default is the free keyword scorer — the LLM scorer costs money and must be
  // opted into explicitly with SCORER=llm. An empty value falls back to the default (see emptyAsUnset).
  SCORER: z.preprocess(emptyAsUnset, z.enum(['keyword', 'llm']).default('keyword')),
  // 'telegram' (default) or 'console' — lets the whole pipeline run offline.
  NOTIFIER: z.enum(['telegram', 'console']).default('telegram'),
  // TheirStack (second, market-wide source). Key absent => poll:theirstack is a clear no-op.
  // Free tier bills 1 API credit PER JOB RETURNED, so these knobs are a credit budget:
  THEIRSTACK_API_KEY: z.string().optional(),
  THEIRSTACK_MAX_AGE_DAYS: z.coerce.number().int().positive().default(14), // posted_at sanity cap
  THEIRSTACK_LIMIT: z.coerce.number().int().min(1).max(500).default(200), // paid tier allows up to 500/page
  THEIRSTACK_MAX_PAGES: z.coerce.number().int().min(1).max(20).default(10), // <=2000 jobs/run (covers a 60-day backfill)
  THEIRSTACK_PERIOD_BUDGET: z.coerce.number().int().positive().default(200), // credits per BILLING PERIOD (free tier: 200/month)
  // Day of month the TheirStack plan renews (paid billing is anniversary-based, not calendar-month).
  THEIRSTACK_BILLING_CYCLE_DAY: z.coerce.number().int().min(1).max(28).default(16),
  // Add bare "Software Engineer"-style titles to the query. OFF by default — only turn on once the
  // LLM scorer is confirmed live (SCORER=llm), or it floods the dashboard with unfiltered noise.
  THEIRSTACK_BROAD_TITLES: z.preprocess((v) => v === 'true' || v === '1', z.boolean()),
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
