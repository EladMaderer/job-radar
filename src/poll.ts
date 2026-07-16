import { pool } from './db/pool.js';
import { runPollCycle, type PollSummary } from './services/pollService.js';

/**
 * One-shot entry: run a single poll cycle then exit. This is what GitHub Actions calls
 * (`npm run poll`). Importing ./config/env at the top of the dependency graph means an invalid
 * environment fails fast before any work starts.
 */
async function main(): Promise<PollSummary> {
  try {
    return await runPollCycle();
  } finally {
    await pool.end();
  }
}

main()
  .then((summary) => {
    // Individual send failures self-heal (retried next cycle), so they stay green. But if there
    // were alerts to send and EVERY one failed, that's likely a misconfiguration — surface it red.
    const systemicAlertFailure = summary.alerted === 0 && summary.failedAlerts > 0;
    process.exit(systemicAlertFailure ? 1 : 0);
  })
  .catch((err) => {
    console.error('[poll] fatal:', err);
    process.exit(1); // non-zero so the Action run shows red
  });
