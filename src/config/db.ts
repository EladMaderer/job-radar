import 'dotenv/config';
import { z } from 'zod';

/**
 * DB-only config, separate from the full app config in env.ts. Anything that just needs the
 * database — the migration runner, the DB pool, the Phase 2 dashboard API — depends on this and
 * therefore does NOT require the Telegram/notifier vars. (The poller still validates the full
 * schema via env.ts.)
 */
const dbSchema = z.object({
  DATABASE_URL: z.string().url('must be a valid postgres connection string'),
});

function loadDbConfig(): z.infer<typeof dbSchema> {
  const parsed = dbSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid database configuration:\n${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const dbConfig = loadDbConfig();
