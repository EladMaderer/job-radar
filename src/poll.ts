import { pool } from './db/pool.js';
import { runPollCycle } from './services/pollService.js';

/**
 * One-shot entry: run a single poll cycle then exit. This is what GitHub Actions calls
 * (`npm run poll`). Importing ./config/env at the top of the dependency graph means an invalid
 * environment fails fast before any work starts.
 */
async function main(): Promise<void> {
  try {
    await runPollCycle();
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[poll] fatal:', err);
  process.exit(1); // non-zero so the Action run shows red
});
