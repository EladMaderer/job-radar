import { config } from './config/env.js';
import { SCORE_CONCURRENCY } from './constants/scoring.js';
import { pool } from './db/pool.js';
import { mapWithConcurrency } from './lib/concurrency.js';
import { listRelevantForRescore, updateScore } from './repositories/jobsRepository.js';
import { getScorer } from './scoring/getScorer.js';
import { classifyLocation } from './scoring/location.js';

const LOCATION_DROP_WHY = 'not in Israel / remote-anywhere with no Israel tie (location re-check)';

/**
 * One-off recalibration: re-check every currently-relevant job's LOCATION and (if it still passes)
 * its score/relevance through the CURRENT scorer, overwriting the stored row. Use this after
 * changing the scoring rubric OR the location rule so the existing dashboard reflects the new rules
 * — the poller itself never re-checks either on already-stored rows, by design.
 *
 * The location re-check is BEFORE the LLM call and skips it entirely on a fail — free, and it's
 * what actually retires foreign/remote-anywhere rows a scoring-only rescore could never touch
 * (`processJobs`'s base location filter runs once, at insert time, not on existing rows).
 * Caveat: only `location` TEXT is persisted (no ATS remote flag / countryCode), so this can only
 * re-derive Israel-ness from city/country name matches, not from a country-code-only signal.
 *
 * Costs LLM credits (~one call per row that passes the location check), but NO TheirStack credits.
 * Knobs: RESCORE_DRY_RUN=1 (report only, no writes), RESCORE_LIMIT=N (process only N rows).
 */
async function main(): Promise<void> {
  const dryRun = process.env.RESCORE_DRY_RUN === '1';
  const limit = process.env.RESCORE_LIMIT ? Number(process.env.RESCORE_LIMIT) : undefined;

  if (config.SCORER !== 'llm') {
    console.error(
      '::error::[rescore] SCORER is not "llm" — re-scoring with the keyword scorer would mark ' +
        'everything relevant and discard the LLM judgments. Set SCORER=llm and re-run. Aborting.',
    );
    process.exit(1);
  }

  const scorer = getScorer();
  const rows = await listRelevantForRescore(limit);
  console.log(`[rescore] re-scoring ${rows.length} relevant rows${dryRun ? ' (DRY RUN)' : ''}...`);

  let changed = 0;
  let dropped = 0;
  let droppedByLocation = 0;
  const samples: string[] = [];

  await mapWithConcurrency(rows, SCORE_CONCURRENCY, async (row) => {
    let score: number;
    let why: string;
    let relevant: boolean;

    if (!classifyLocation(row.job).keep) {
      // Foreign / remote-anywhere with no Israel tie — drop for free, skip the LLM call entirely.
      score = 0;
      why = LOCATION_DROP_WHY;
      relevant = false;
      droppedByLocation += 1;
    } else {
      ({ score, why, relevant } = await scorer.score(row.job));
    }

    const didChange = score !== row.oldScore || relevant !== row.oldRelevant;
    if (didChange) changed += 1;
    if (!relevant) dropped += 1;
    if (!dryRun) await updateScore(row.id, score, why, relevant);
    if (samples.length < 25 && didChange) {
      const to = relevant ? String(score) : 'DROP';
      samples.push(
        `  ${String(row.oldScore ?? '—').padStart(3)} → ${to.padStart(4)}  ${row.job.title.slice(0, 48)}`,
      );
    }
  });

  console.log(
    `[rescore] done${dryRun ? ' (DRY RUN — nothing written)' : ''}: ${rows.length} rescored, ` +
      `${changed} changed, ${dropped} now irrelevant (${droppedByLocation} by location, ` +
      `${dropped - droppedByLocation} by scorer) — hidden from dashboard.`,
  );
  if (samples.length > 0) {
    console.log('[rescore] sample changes (old → new):');
    samples.forEach((s) => console.log(s));
  }
  await pool.end();
}

main().catch((err) => {
  console.error('[rescore] fatal:', err);
  process.exit(1);
});
