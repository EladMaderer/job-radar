import { config } from '../config/env.js';
import { keywordScorer } from './keywordScorer.js';
import { createLlmScorer } from './llmScorer.js';
import { hasFrontendSignal } from './prefilter.js';
import type { Job } from '../ats/types.js';
import type { Scorer } from './types.js';

/** Wrap a primary scorer so any failure on a single job falls back to the keyword scorer. */
function withKeywordFallback(primary: Scorer): Scorer {
  return {
    async score(job: Job) {
      try {
        return await primary.score(job);
      } catch (err) {
        console.warn(
          `[score] LLM scorer failed for "${job.title}", using keyword: ${(err as Error).message}`,
        );
        return keywordScorer.score(job);
      }
    },
  };
}

/**
 * Hard per-run ceiling on LLM calls — a credit circuit-breaker. `getScorer()` is called once per
 * run, so this counter lives for exactly one cycle and resets on the next. Past the cap, jobs fall
 * back to the free keyword scorer (never unbounded spend), logged once. A normal re-baseline stays
 * far under the cap; hitting it signals something abnormal (a board or discovery explosion), and the
 * user can raise MAX_LLM_SCORES_PER_RUN and re-baseline if the volume was legitimate.
 *
 * Trade-off: overflow jobs get a keyword score (relevant=true) so they may show as noise, and dedup
 * means they won't be re-scored later — acceptable, since the cap only trips in a runaway the user
 * is meant to notice and act on, not in normal operation.
 */
function withCallBudget(primary: Scorer, maxCalls: number): Scorer {
  let used = 0;
  let warned = false;
  return {
    async score(job: Job) {
      if (used >= maxCalls) {
        if (!warned) {
          warned = true;
          console.warn(
            `[score] LLM call budget reached (${maxCalls}/run) — remaining jobs use the free ` +
              'keyword scorer this run. Raise MAX_LLM_SCORES_PER_RUN and re-baseline if intended.',
          );
        }
        return keywordScorer.score(job);
      }
      used += 1;
      return primary.score(job);
    },
  };
}

/**
 * Drop jobs with no frontend signal for free (no LLM call). Since React/React Native is required,
 * a role with zero frontend signal is never a fit — this saves an API call per obvious non-match,
 * which is most of the board. Real frontend roles still reach `primary` for the nuanced judgment.
 */
function withFrontendPrefilter(primary: Scorer): Scorer {
  return {
    async score(job: Job) {
      if (!hasFrontendSignal(job)) {
        return {
          relevant: false,
          score: 0,
          why: 'no frontend/React signal (pre-filter, no LLM call)',
        };
      }
      return primary.score(job);
    },
  };
}

/**
 * Pick the scorer from config. The keyword scorer is the DEFAULT — the LLM scorer costs real money
 * (one Anthropic call per new job; a baseline run is hundreds of calls), so it must be explicit
 * opt-in via SCORER=llm, never triggered merely by an API key being present.
 * - SCORER=keyword (default) -> keyword only (free, no API).
 * - SCORER=llm               -> LLM (requires ANTHROPIC_API_KEY), frontend pre-filter + keyword fallback.
 */
export function getScorer(): Scorer {
  const { SCORER, ANTHROPIC_API_KEY } = config;

  if (SCORER === 'llm') {
    if (!ANTHROPIC_API_KEY) {
      console.warn('[score] SCORER=llm but ANTHROPIC_API_KEY is unset — using keyword scorer.');
      return keywordScorer;
    }
    console.log(
      `[score] using LLM scorer (Claude Haiku 4.5): frontend pre-filter → budget ` +
        `(${config.MAX_LLM_SCORES_PER_RUN}/run) → keyword fallback.`,
    );
    // Layered outside-in: pre-filter drops obvious non-frontend roles for FREE (no budget spent),
    // then the per-run call budget caps spend, then per-call keyword fallback handles LLM errors.
    return withFrontendPrefilter(
      withCallBudget(
        withKeywordFallback(createLlmScorer(ANTHROPIC_API_KEY)),
        config.MAX_LLM_SCORES_PER_RUN,
      ),
    );
  }

  console.log('[score] using keyword scorer (default; set SCORER=llm to enable LLM scoring).');
  return keywordScorer;
}
