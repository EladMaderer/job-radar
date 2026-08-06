import { config } from './config/env.js';
import { SCORE_CONCURRENCY } from './constants/scoring.js';
import { pool } from './db/pool.js';
import { mapWithConcurrency } from './lib/concurrency.js';
import { listRelevantForRescore, updateScore } from './repositories/jobsRepository.js';
import { getScorer, resetScorerStats, scorerStats } from './scoring/getScorer.js';
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

  // Same disaster, different cause: SCORER=llm but no API key makes getScorer() SILENTLY return the
  // keyword scorer, which marks everything relevant=true. The old guard checked only SCORER, so a
  // keyless run "succeeded" while overwriting every LLM judgment with un-droppable keyword scores.
  if (!config.ANTHROPIC_API_KEY) {
    console.error(
      '::error::[rescore] SCORER=llm but ANTHROPIC_API_KEY is unset — getScorer() would silently ' +
        'fall back to the keyword scorer, which NEVER drops a role, overwriting every stored LLM ' +
        'judgment with un-droppable keyword scores. Add the ANTHROPIC_API_KEY secret. Aborting.',
    );
    process.exit(1);
  }

  resetScorerStats();
  const scorer = getScorer();
  const rows = await listRelevantForRescore(limit);
  console.log(`[rescore] re-scoring ${rows.length} relevant rows${dryRun ? ' (DRY RUN)' : ''}...`);

  let changed = 0;
  let dropped = 0;
  let droppedByLocation = 0;
  let skippedNoDescription = 0;
  const samples: string[] = [];

  await mapWithConcurrency(rows, SCORE_CONCURRENCY, async (row) => {
    let score: number;
    let why: string;
    let relevant: boolean;

    if (!classifyLocation(row.job).keep) {
      // Foreign / remote-anywhere with no Israel tie — drop for free, skip the LLM call entirely.
      // Runs on EVERY relevant row, including description-less ones the LLM pass below can't judge.
      score = 0;
      why = LOCATION_DROP_WHY;
      relevant = false;
      droppedByLocation += 1;
    } else if (!row.job.description) {
      // Nothing for the LLM to judge — scoring an empty description yields garbage. Leave the row
      // exactly as-is; the location check above already had its say.
      skippedNoDescription += 1;
      return;
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
    `[rescore] done${dryRun ? ' (DRY RUN — nothing written)' : ''}: ${rows.length} examined, ` +
      `${changed} changed, ${dropped} now irrelevant (${droppedByLocation} by location, ` +
      `${dropped - droppedByLocation} by scorer) — hidden from dashboard. ` +
      `${skippedNoDescription} left as-is (no description to re-judge).`,
  );
  console.log(
    `[rescore] scorer: ${scorerStats.llmScored} scored by LLM, ` +
      `${scorerStats.keywordFallbacks} fell back to keyword.`,
  );
  if (scorerStats.keywordFallbacks > 0) {
    // A keyword-scored row is marked relevant=true unconditionally, so these rows are now noise the
    // rubric can never drop — the run must not look clean.
    console.error(
      `::error::[rescore] ${scorerStats.keywordFallbacks} row(s) fell back to the KEYWORD scorer ` +
        '(LLM call failed, or MAX_LLM_SCORES_PER_RUN exhausted). Keyword rows are always marked ' +
        'relevant=true, so they cannot be dropped by the rubric and will show as dashboard noise. ' +
        'Check the warnings above for the cause, then re-run.',
    );
  }
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
