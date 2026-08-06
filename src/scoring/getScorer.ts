import { config } from '../config/env.js';
import { keywordScorer } from './keywordScorer.js';
import { createLlmScorer } from './llmScorer.js';
import { hasFrontendSignal } from './prefilter.js';
import type { Job } from '../ats/types.js';
import type { Scorer } from './types.js';

export const scorerStats = {
  llmScored: 0,
  keywordFallbacks: 0,
  degraded: false,
};

export function resetScorerStats(): void {
  scorerStats.llmScored = 0;
  scorerStats.keywordFallbacks = 0;
  scorerStats.degraded = false;
}

function withKeywordFallback(primary: Scorer): Scorer {
  return {
    async score(job: Job) {
      try {
        const result = await primary.score(job);
        scorerStats.llmScored += 1;
        return result;
      } catch (err) {
        scorerStats.keywordFallbacks += 1;
        console.warn(
          `[score] LLM scorer failed for "${job.title}", using keyword: ${(err as Error).message}`,
        );
        return keywordScorer.score(job);
      }
    },
  };
}

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
        scorerStats.keywordFallbacks += 1;
        return keywordScorer.score(job);
      }
      used += 1;
      return primary.score(job);
    },
  };
}

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

export function getScorer(): Scorer {
  const { SCORER, ANTHROPIC_API_KEY } = config;

  if (SCORER === 'llm') {
    if (!ANTHROPIC_API_KEY) {
      scorerStats.degraded = true;
      console.error(
        '::error::[score] SCORER=llm but ANTHROPIC_API_KEY is unset — silently falling back to the ' +
          'keyword scorer, which NEVER drops a role. The unfiltered TheirStack query then stores ' +
          'noise. Add the ANTHROPIC_API_KEY secret.',
      );
      return keywordScorer;
    }
    console.log(
      `[score] using LLM scorer (Claude Haiku 4.5): frontend pre-filter → budget ` +
        `(${config.MAX_LLM_SCORES_PER_RUN}/run) → keyword fallback.`,
    );
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
