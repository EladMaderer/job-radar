import type { Job } from '../ats/types.js';
import {
  AI_KEYWORDS,
  BACKEND_PRIMARY_KEYWORDS,
  BACKEND_SIGNAL_KEYWORDS,
  DESCRIPTION_WEIGHT_FACTOR,
  FRONTEND_KEYWORDS,
  FRONTEND_ONLY_KEYWORDS,
  NEGATIVE_KEYWORDS,
  SCORE_MAX,
  SCORE_MIN,
  SENIOR_KEYWORDS,
  WEIGHTS,
} from '../constants/scoring.js';
import { classifyLocation } from './location.js';
import { matchesAny } from './match.js';
import type { Scorer, ScoreResult } from './types.js';

type Where = 'title' | 'description' | null;

/** Where a keyword set first matches — title wins over description (title is curated signal). */
function locate(title: string, description: string, keywords: readonly string[]): Where {
  if (matchesAny(title, keywords)) return 'title';
  if (matchesAny(description, keywords)) return 'description';
  return null;
}

/** Full weight for a title match, reduced for description-only; null match contributes nothing. */
function weightFor(where: Where, fullWeight: number): number {
  if (where === 'title') return fullWeight;
  if (where === 'description') return Math.round(fullWeight * DESCRIPTION_WEIGHT_FACTOR);
  return 0;
}

const clamp = (n: number): number => Math.max(SCORE_MIN, Math.min(SCORE_MAX, n));

/**
 * Keyword scorer v1. Scores title + description (title weighted higher) so signals that live in
 * the body — "AI", "senior", backend-language dominance — aren't missed by a generic title.
 *
 * Ranking intent: React+Node (FE-oriented full-stack) > pure React > backend-heavy "full stack".
 */
export const keywordScorer: Scorer = {
  score(job: Job): Promise<ScoreResult> {
    return Promise.resolve(scoreSync(job));
  },
};

function scoreSync(job: Job): ScoreResult {
  const title = job.title ?? '';
  const description = job.description ?? '';
  const reasons: string[] = [];
  let score = 0;

  // Frontend / full-stack base signal.
  const frontendWhere = locate(title, description, FRONTEND_KEYWORDS);
  const frontendPts = weightFor(frontendWhere, WEIGHTS.frontend);
  if (frontendPts) {
    score += frontendPts;
    reasons.push(`frontend/full-stack (${frontendWhere}) +${frontendPts}`);
  }

  // Sweet spot: frontend-SPECIFIC signal AND backend signal anywhere => my ideal profile.
  const hasFrontendOnly =
    matchesAny(title, FRONTEND_ONLY_KEYWORDS) || matchesAny(description, FRONTEND_ONLY_KEYWORDS);
  const hasBackendSignal =
    matchesAny(title, BACKEND_SIGNAL_KEYWORDS) || matchesAny(description, BACKEND_SIGNAL_KEYWORDS);
  if (hasFrontendOnly && hasBackendSignal) {
    score += WEIGHTS.fullStackSweetSpot;
    reasons.push(`FE-oriented full-stack sweet spot +${WEIGHTS.fullStackSweetSpot}`);
  }

  // Seniority.
  const seniorWhere = locate(title, description, SENIOR_KEYWORDS);
  const seniorPts = weightFor(seniorWhere, WEIGHTS.senior);
  if (seniorPts) {
    score += seniorPts;
    reasons.push(`senior (${seniorWhere}) +${seniorPts}`);
  }

  // AI / AI-tooling.
  const aiWhere = locate(title, description, AI_KEYWORDS);
  const aiPts = weightFor(aiWhere, WEIGHTS.ai);
  if (aiPts) {
    score += aiPts;
    reasons.push(`AI (${aiWhere}) +${aiPts}`);
  }

  // Location bonus: commute zone, or remote within Israel. Remote-anywhere earns nothing.
  const loc = classifyLocation(job);
  if (loc.inCommuteZone) {
    score += WEIGHTS.commuteLocation;
    reasons.push(`commute zone +${WEIGHTS.commuteLocation}`);
  } else if (loc.inIsrael && loc.isRemote) {
    score += WEIGHTS.commuteLocation;
    reasons.push(`remote in Israel +${WEIGHTS.commuteLocation}`);
  }

  // Backend-PRIMARY penalty — applies even when the title says "full stack".
  const backendWhere = locate(title, description, BACKEND_PRIMARY_KEYWORDS);
  const backendPts = weightFor(backendWhere, WEIGHTS.backendPrimaryPenalty);
  if (backendPts) {
    score += backendPts;
    reasons.push(`backend-primary (${backendWhere}) ${backendPts}`);
  }

  // Other disqualifiers (DevOps/SRE/data-eng/Angular-only/junior/intern).
  const negativeWhere = locate(title, description, NEGATIVE_KEYWORDS);
  const negativePts = weightFor(negativeWhere, WEIGHTS.backendPrimaryPenalty);
  if (negativePts) {
    score += negativePts;
    reasons.push(`disqualifier (${negativeWhere}) ${negativePts}`);
  }

  return {
    score: clamp(score),
    why: reasons.length > 0 ? reasons.join('; ') : 'no matching signals',
    relevant: true, // keyword scorer never drops on role type; only the LLM scorer does
  };
}
