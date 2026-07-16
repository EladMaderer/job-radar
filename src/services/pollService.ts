import type { Job } from '../ats/types.js';
import { config } from '../config/env.js';
import { MAX_ALERTS_PER_CYCLE, TELEGRAM_SEND_GAP_MS } from '../constants/messages.js';
import { getNotifier } from '../notify/index.js';
import { adapterFor, COMPANIES } from '../registry/companies.js';
import {
  countJobs,
  countPendingAlerts,
  findExistingExternalIds,
  findPendingAlerts,
  insertJob,
  markAlerted,
  updateJobFields,
} from '../repositories/jobsRepository.js';
import { keywordScorer } from '../scoring/keywordScorer.js';
import { classifyLocation } from '../scoring/location.js';
import type { Scorer } from '../scoring/types.js';

export interface PollSummary {
  fetched: number; // jobs returned by all boards
  relevant: number; // passed the base location filter
  inserted: number; // newly stored this cycle
  updated: number; // already-seen rows refreshed
  alerted: number; // alerts actually sent (and marked) this cycle
  failedAlerts: number; // sends that failed — stay pending, retried next cycle
  baseline: boolean; // true on the first-ever run (seed silently)
  failedCompanies: string[];
}

/** A relevant, scored job carried through the cycle. */
interface ScoredJob {
  job: Job;
  score: number;
  why: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One full poll cycle. Stateless: "new" is decided against the DB, so this is correct whether
 * run once (GitHub Actions) or on a loop.
 *
 * First-ever run (empty table) baseline-seeds: every current role is stored but marked alerted,
 * so alerts only ever mean "appeared since we started watching."
 *
 * Alerting is decoupled from storage: a new job is stored immediately with alerted_at=NULL, and
 * only marked alerted once its message actually sends. A failed send is logged and left pending —
 * never fatal, never lost — and retried on the next cycle.
 */
export async function runPollCycle(scorer: Scorer = keywordScorer): Promise<PollSummary> {
  const baseline = (await countJobs()) === 0;
  const summary: PollSummary = {
    fetched: 0,
    relevant: 0,
    inserted: 0,
    updated: 0,
    alerted: 0,
    failedAlerts: 0,
    baseline,
    failedCompanies: [],
  };

  for (const company of COMPANIES) {
    let scored: ScoredJob[];
    try {
      const adapter = adapterFor(company);
      const raw = await adapter(company.slug, company.name);
      summary.fetched += raw.length;
      scored = [];
      for (const job of raw) {
        if (!classifyLocation(job).keep) continue; // clearly-foreign roles are never stored
        const { score, why } = scorer.score(job);
        scored.push({ job, score, why });
      }
    } catch (err) {
      // One bad board must never kill the cycle.
      summary.failedCompanies.push(company.name);
      console.error(`[poll] ${company.name} failed: ${(err as Error).message}`);
      continue;
    }

    summary.relevant += scored.length;

    const existing = await findExistingExternalIds(
      company.ats,
      scored.map((s) => s.job.externalId),
    );

    for (const { job, score, why } of scored) {
      if (existing.has(job.externalId)) {
        await updateJobFields(job, score, why);
        summary.updated += 1;
      } else {
        // Baseline seed marks everything alerted (silent); otherwise leave pending for alerting.
        await insertJob(job, score, why, baseline);
        summary.inserted += 1;
      }
    }
  }

  if (!baseline) {
    await sendPendingAlerts(summary);
  }

  logSummary(summary);
  return summary;
}

/**
 * Send every job still owed an alert (fresh + any that failed on a prior cycle), highest score
 * first, capped per cycle. Each job is marked alerted only after its send succeeds; failures are
 * counted and left pending for the next run.
 */
async function sendPendingAlerts(summary: PollSummary): Promise<void> {
  const notifier = getNotifier();
  const pending = await findPendingAlerts(config.SCORE_THRESHOLD, MAX_ALERTS_PER_CYCLE);
  if (pending.length === 0) return;

  for (const alert of pending) {
    try {
      await notifier.sendAlert(alert);
      await markAlerted(alert.id);
      summary.alerted += 1;
      await sleep(TELEGRAM_SEND_GAP_MS);
    } catch (err) {
      summary.failedAlerts += 1;
      console.error(
        `[poll] alert failed for job ${alert.id} (${alert.title}): ${(err as Error).message}`,
      );
    }
  }

  const stillPending = await countPendingAlerts(config.SCORE_THRESHOLD);
  if (stillPending > 0) {
    console.log(`[poll] ${stillPending} alert(s) still pending — will send next cycle.`);
  }
}

function logSummary(s: PollSummary): void {
  const mode = s.baseline ? ' [BASELINE SEED — no alerts]' : '';
  console.log(
    `[poll] fetched=${s.fetched} relevant=${s.relevant} inserted=${s.inserted} ` +
      `updated=${s.updated} alerted=${s.alerted} failedAlerts=${s.failedAlerts}${mode}`,
  );
  if (s.failedCompanies.length > 0) {
    console.warn(`[poll] failed boards: ${s.failedCompanies.join(', ')}`);
  }
}
