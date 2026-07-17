import { config } from './config/env.js';
import { SCORE_CONCURRENCY } from './constants/scoring.js';
import { pool } from './db/pool.js';
import { mapWithConcurrency } from './lib/concurrency.js';
import { listRelevantForRescore, updateScore } from './repositories/jobsRepository.js';
import { getScorer } from './scoring/getScorer.js';

/**
 * One-off recalibration: re-score every currently-relevant job through the CURRENT scorer and
 * overwrite its stored score/relevance. Use this after changing the scoring rubric so the existing
 * dashboard reflects the new rules — the poller itself never re-scores (dedup), by design.
 *
 * Costs LLM credits (~one call per relevant row), but NO TheirStack credits (no re-fetch).
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
  const samples: string[] = [];

  await mapWithConcurrency(rows, SCORE_CONCURRENCY, async (row) => {
    const { score, why, relevant } = await scorer.score(row.job);
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
      `${changed} changed, ${dropped} now irrelevant (hidden from dashboard).`,
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
