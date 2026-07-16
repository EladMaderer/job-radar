import { config } from './config/env.js';
import { pool } from './db/pool.js';
import { runTheirStackCycle } from './services/pollService.js';

/**
 * One-shot TheirStack entry (`npm run poll:theirstack`) — the slow-cadence, credit-metered second
 * source. Missing API key is an intentional no-op (exit 0): the ATS pipeline must keep working for
 * users who never set TheirStack up. A real fetch failure exits 1 so the workflow shows red —
 * isolation from ATS polling is guaranteed by this being a separate workflow.
 */
async function main(): Promise<void> {
  if (!config.THEIRSTACK_API_KEY) {
    console.log(
      '[theirstack] THEIRSTACK_API_KEY is not set — skipping (this is fine; the ATS poller is unaffected). ' +
        'Get a free key at theirstack.com and add it as a secret to enable market-wide polling.',
    );
    return;
  }
  try {
    await runTheirStackCycle();
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[theirstack] fatal:', err);
  process.exit(1);
});
