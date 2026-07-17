import type { Job } from '../ats/types.js';
import { config } from '../config/env.js';
import { MAX_ALERTS_PER_CYCLE, TELEGRAM_SEND_GAP_MS } from '../constants/messages.js';
import { getNotifier } from '../notify/index.js';
import { adapterFor, COMPANIES } from '../registry/companies.js';
import {
  addTheirStackCreditsUsed,
  countPendingAlerts,
  existsSimilarJob,
  findExistingExternalIds,
  findPendingAlerts,
  insertJob,
  latestFirstSeen,
  markAlerted,
  sourcesWithRows,
  theirStackCreditsUsed,
  updateJobFields,
} from '../repositories/jobsRepository.js';
import { SCORE_CONCURRENCY } from '../constants/scoring.js';
import { billingPeriod } from '../lib/billingPeriod.js';
import { mapWithConcurrency } from '../lib/concurrency.js';
import { getScorer } from '../scoring/getScorer.js';
import { classifyLocation } from '../scoring/location.js';
import { fetchTheirStackJobs, THEIRSTACK_SOURCE } from '../sources/theirstack.js';
import type { Scorer } from '../scoring/types.js';

export interface PollSummary {
  fetched: number; // jobs returned by all boards / the source
  candidates: number; // passed the base location filter
  inserted: number; // newly stored this cycle
  updated: number; // already-seen rows refreshed
  dropped: number; // new jobs judged irrelevant — stored lean as dedup memory, hidden from dashboard
  suppressed: number; // cross-source duplicates — stored but never alerted
  alerted: number; // alerts actually sent (and marked) this cycle
  failedAlerts: number; // sends that failed — stay pending, retried next cycle
  baselineSeeded: string[]; // sources that baseline-seeded silently this cycle
  failedCompanies: string[];
}

function emptySummary(): PollSummary {
  return {
    fetched: 0,
    candidates: 0,
    inserted: 0,
    updated: 0,
    dropped: 0,
    suppressed: 0,
    alerted: 0,
    failedAlerts: 0,
    baselineSeeded: [],
    failedCompanies: [],
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Shared downstream for every source: location-filter → dedup against the DB → score new jobs →
 * store (always, including irrelevant ones — the scored-once guarantee) → count.
 *
 * Baseline is PER-SOURCE: a job whose source has no rows yet is stored pre-marked alerted (silent
 * seed), so adding a new source to an already-populated DB never fires alerts for its pre-existing
 * jobs. `suppressAlert(job)` lets a caller silence specific jobs (cross-source duplicates).
 */
async function processJobs(
  jobs: Job[],
  scorer: Scorer,
  summary: PollSummary,
  knownSources: Set<string>,
  suppressAlert?: (job: Job) => Promise<boolean>,
): Promise<void> {
  const candidates = jobs.filter((job) => classifyLocation(job).keep);
  summary.candidates += candidates.length;

  // Dedup per source (a batch can span sources in principle; group to keep the query correct).
  const bySource = new Map<string, Job[]>();
  for (const job of candidates) {
    const list = bySource.get(job.source) ?? [];
    list.push(job);
    bySource.set(job.source, list);
  }

  const newJobs: Job[] = [];
  for (const [source, sourceJobs] of bySource) {
    const existing = await findExistingExternalIds(
      source,
      sourceJobs.map((job) => job.externalId),
    );
    for (const job of sourceJobs) {
      if (existing.has(job.externalId)) {
        // Seen before: refresh mutable fields only. Never re-score (would re-spend LLM tokens).
        await updateJobFields(job);
        summary.updated += 1;
      } else {
        newJobs.push(job);
      }
    }
    if (!knownSources.has(source) && !summary.baselineSeeded.includes(source)) {
      summary.baselineSeeded.push(source);
    }
  }

  // Score new jobs in parallel (each may be an LLM round-trip). ALWAYS store the result —
  // including irrelevant jobs (relevant=false) — so a job is scored exactly once and never
  // re-billed on a later cycle.
  await mapWithConcurrency(newJobs, SCORE_CONCURRENCY, async (job) => {
    const { score, why, relevant } = await scorer.score(job);
    const baseline = !knownSources.has(job.source);
    let silent = baseline;
    let finalWhy = why;
    if (!silent && suppressAlert && (await suppressAlert(job))) {
      silent = true;
      finalWhy = `${why} [alert suppressed: same role already tracked via another source]`;
      summary.suppressed += 1;
    }
    await insertJob(job, score, finalWhy, silent, relevant);
    if (relevant) summary.inserted += 1;
    else summary.dropped += 1;
  });
}

/**
 * One full ATS poll cycle over the company registry. Stateless: "new" is decided against the DB,
 * so this is correct whether run once (GitHub Actions) or on a loop.
 *
 * Alerting is decoupled from storage: a new job is stored immediately with alerted_at=NULL, and
 * only marked alerted once its message actually sends. A failed send is logged and left pending —
 * never fatal, never lost — and retried on the next cycle.
 */
export async function runPollCycle(scorer: Scorer = getScorer()): Promise<PollSummary> {
  const knownSources = await sourcesWithRows();
  const summary = emptySummary();

  for (const company of COMPANIES) {
    let raw: Job[];
    try {
      const adapter = adapterFor(company);
      raw = await adapter(company.slug, company.name);
    } catch (err) {
      // One bad board must never kill the cycle.
      summary.failedCompanies.push(company.name);
      console.error(`[poll] ${company.name} failed: ${(err as Error).message}`);
      continue;
    }
    summary.fetched += raw.length;
    await processJobs(raw, scorer, summary, knownSources);
  }

  await sendPendingAlerts(summary);
  logSummary('poll', summary);
  return summary;
}

/**
 * One TheirStack cycle (separate slow cadence — every returned job costs an API credit).
 * Incremental: discovered_at_gte is derived from when we last stored a theirstack row, so each
 * job is fetched and billed ~once. A hard monthly budget guard stops the burn if filters ever
 * misbehave. Cross-source duplicates (same role already tracked via an ATS board under a name
 * variant the server-side exclusion missed) are stored but never alerted.
 */
export async function runTheirStackCycle(scorer: Scorer = getScorer()): Promise<PollSummary> {
  const summary = emptySummary();

  // Scorer guard: the TheirStack query intentionally has NO seniority/precision filter, on the
  // premise the LLM scorer judges relevance. The keyword scorer never drops a role, so running this
  // without SCORER=llm stores unfiltered noise. Warn loudly (GitHub annotation) — don't block.
  if (config.SCORER !== 'llm') {
    console.warn(
      '::warning::[theirstack] SCORER is not "llm" — the TheirStack query has no seniority/precision ' +
        'filter (the LLM is meant to be the strainer), and the keyword scorer NEVER drops a role, so ' +
        'this run will store UNFILTERED noise. Set repo variable SCORER=llm + the ANTHROPIC_API_KEY secret.',
    );
  }

  // Accurate credit guard: count actual credits SPENT (jobs returned), tracked in its own table so
  // it reflects TheirStack's per-returned-job billing and survives re-baselines. Keyed by BILLING
  // PERIOD start (plan renews on an anniversary day, not the calendar 1st).
  const budget = config.THEIRSTACK_PERIOD_BUDGET;
  const { start: periodStart, end: periodEnd } = billingPeriod(
    new Date(),
    config.THEIRSTACK_BILLING_CYCLE_DAY,
  );
  const used = await theirStackCreditsUsed(periodStart);
  console.log(`[theirstack] credits: ${used}/${budget} for period ${periodStart} → ${periodEnd}`);
  if (used >= budget) {
    console.warn(
      `::warning::[theirstack] credit budget reached (${used}/${budget} for period ${periodStart} → ` +
        `${periodEnd}) — skipping run. Resets on day ${config.THEIRSTACK_BILLING_CYCLE_DAY}.`,
    );
    logSummary('theirstack', summary);
    return summary;
  }

  const knownSources = await sourcesWithRows();
  const watermark = await latestFirstSeen(THEIRSTACK_SOURCE);
  // Hard cap: never fetch more than the credits remaining this period (each returned job = 1 credit).
  const remaining = budget - used;
  const jobs = await fetchTheirStackJobs(watermark, remaining);
  // Every returned job cost 1 credit — record it before processing (which filters some out).
  await addTheirStackCreditsUsed(periodStart, jobs.length);
  summary.fetched += jobs.length;

  await processJobs(jobs, scorer, summary, knownSources, (job) =>
    existsSimilarJob(job.company, job.title, THEIRSTACK_SOURCE),
  );

  await sendPendingAlerts(summary);
  logSummary('theirstack', summary);
  return summary;
}

/**
 * Send every job still owed an alert (fresh + any that failed on a prior cycle), highest score
 * first, capped per cycle. Each job is marked alerted only after its send succeeds; failures are
 * counted and left pending for the next run. Baseline-seeded rows are already marked alerted, so
 * running this unconditionally is safe in every cycle.
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

function logSummary(tag: string, s: PollSummary): void {
  const seeded =
    s.baselineSeeded.length > 0 ? ` [BASELINE SEED (${s.baselineSeeded.join(', ')}) — silent]` : '';
  console.log(
    `[${tag}] fetched=${s.fetched} candidates=${s.candidates} inserted=${s.inserted} ` +
      `updated=${s.updated} dropped=${s.dropped} suppressed=${s.suppressed} alerted=${s.alerted} ` +
      `failedAlerts=${s.failedAlerts}${seeded}`,
  );
  if (s.failedCompanies.length > 0) {
    console.warn(`[${tag}] failed boards: ${s.failedCompanies.join(', ')}`);
  }
}
