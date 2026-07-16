import type { Job } from '../ats/types.js';
import { config } from '../config/env.js';
import { getNotifier, type JobAlert } from '../notify/index.js';
import { adapterFor, COMPANIES } from '../registry/companies.js';
import {
  countJobs,
  findExistingExternalIds,
  insertJob,
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
  alerted: number; // alerts actually sent
  baseline: boolean; // true on the first-ever run (seed silently)
  failedCompanies: string[];
}

/** A relevant, scored job carried through the cycle. */
interface ScoredJob {
  job: Job;
  score: number;
  why: string;
}

/**
 * One full poll cycle. Stateless: "new" is decided against the DB, so this is correct whether
 * run once (GitHub Actions) or on a loop.
 *
 * First-ever run (empty table) baseline-seeds: every current role is stored but NO alerts fire,
 * so alerts only ever mean "appeared since we started watching."
 */
export async function runPollCycle(scorer: Scorer = keywordScorer): Promise<PollSummary> {
  const baseline = (await countJobs()) === 0;
  const summary: PollSummary = {
    fetched: 0,
    relevant: 0,
    inserted: 0,
    updated: 0,
    alerted: 0,
    baseline,
    failedCompanies: [],
  };
  const newAlerts: JobAlert[] = [];

  for (const company of COMPANIES) {
    let scored: ScoredJob[];
    try {
      const adapter = adapterFor(company);
      const raw = await adapter(company.slug, company.name);
      summary.fetched += raw.length;
      scored = [];
      for (const job of raw) {
        if (!classifyLocation(job).keep) continue;
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
        await insertJob(job, score, why);
        summary.inserted += 1;
        if (!baseline && score >= config.SCORE_THRESHOLD) {
          newAlerts.push({ job, score, why });
        }
      }
    }
  }

  // Highest-scoring first, so if we hit the per-cycle cap the best matches are the ones sent.
  newAlerts.sort((a, b) => b.score - a.score);
  if (newAlerts.length > 0) {
    await getNotifier().sendAlerts(newAlerts);
    summary.alerted = newAlerts.length;
  }

  logSummary(summary);
  return summary;
}

function logSummary(s: PollSummary): void {
  const mode = s.baseline ? ' [BASELINE SEED — no alerts]' : '';
  console.log(
    `[poll] fetched=${s.fetched} relevant=${s.relevant} inserted=${s.inserted} ` +
      `updated=${s.updated} alerted=${s.alerted}${mode}`,
  );
  if (s.failedCompanies.length > 0) {
    console.warn(`[poll] failed boards: ${s.failedCompanies.join(', ')}`);
  }
}
