import cron from 'node-cron';
import { config } from './config/env.js';
import { runPollCycle } from './services/pollService.js';

/**
 * Long-running entry for LOCAL always-on dev only: runs a poll cycle now, then every
 * POLL_INTERVAL_MIN via node-cron. Production uses the stateless one-shot (`npm run poll`)
 * on a GitHub Actions schedule instead — no server.
 */
let running = false;

async function cycle(): Promise<void> {
  if (running) {
    console.warn('[start] previous cycle still running, skipping this tick.');
    return;
  }
  running = true;
  try {
    await runPollCycle();
  } catch (err) {
    console.error('[start] cycle error:', err);
  } finally {
    running = false;
  }
}

const expression = `*/${config.POLL_INTERVAL_MIN} * * * *`;
console.log(`[start] scheduling poll every ${config.POLL_INTERVAL_MIN} min ("${expression}")`);
void cycle(); // run once immediately
cron.schedule(expression, () => void cycle());
