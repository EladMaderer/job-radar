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
 * Pick the scorer from config:
 * - SCORER=keyword       -> keyword only (free, no API).
 * - SCORER=llm           -> LLM (requires ANTHROPIC_API_KEY), keyword fallback per job.
 * - SCORER=auto (default) -> LLM when ANTHROPIC_API_KEY is set, otherwise keyword.
 */
export function getScorer(): Scorer {
  const { SCORER, ANTHROPIC_API_KEY } = config;

  if (SCORER === 'keyword') return keywordScorer;

  if (SCORER === 'llm' || (SCORER === 'auto' && ANTHROPIC_API_KEY)) {
    if (!ANTHROPIC_API_KEY) {
      console.warn('[score] SCORER=llm but ANTHROPIC_API_KEY is unset — using keyword scorer.');
      return keywordScorer;
    }
    console.log('[score] using LLM scorer (Claude Haiku 4.5) with frontend pre-filter + fallback.');
    // Pre-filter first (skips the LLM call for obvious non-frontend roles), then the LLM with fallback.
    return withFrontendPrefilter(withKeywordFallback(createLlmScorer(ANTHROPIC_API_KEY)));
  }

  console.log('[score] using keyword scorer (no ANTHROPIC_API_KEY set).');
  return keywordScorer;
}
