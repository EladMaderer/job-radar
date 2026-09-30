import type { Job } from '../ats/types.js';
import {
  BACKEND_PRIMARY_KEYWORDS,
  BACKEND_PRIMARY_SLUGS,
  BACKEND_SIGNAL_KEYWORDS,
  BACKEND_SIGNAL_SLUGS,
  DESCRIPTION_WEIGHT_FACTOR,
  FRONTEND_KEYWORDS,
  FRONTEND_ONLY_KEYWORDS,
  FRONTEND_SLUGS,
  LEAD_ROLE_KEYWORDS,
  NEGATIVE_KEYWORDS,
  REACT_NATIVE_KEYWORDS,
  REACT_NATIVE_SLUGS,
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
 * the body — "senior", React Native, backend-language dominance — aren't missed by a generic title.
 *
 * Ranking intent: React Native > React+Node (FE-oriented full-stack) > pure React > backend-heavy
 * "full stack".
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

  // Curated technology slugs (TheirStack) — structured metadata beats regexing prose, so when
  // present the slug channel supplies signals at title-grade confidence.
  const slugs = (job.technologySlugs ?? []).map((s) => s.toLowerCase());
  const slugFrontend = slugs.some((s) => FRONTEND_SLUGS.includes(s));
  const slugBackendSignal = slugs.some((s) => BACKEND_SIGNAL_SLUGS.includes(s));
  const slugBackendPrimary = slugs.some((s) => BACKEND_PRIMARY_SLUGS.includes(s));

  // React Native anywhere is unambiguous frontend signal — a "Mobile Engineer" title with RN in
  // the body must earn the full frontend base, not the reduced description-only weight.
  const isReactNative =
    slugs.some((s) => REACT_NATIVE_SLUGS.includes(s)) ||
    matchesAny(title, REACT_NATIVE_KEYWORDS) ||
    matchesAny(description, REACT_NATIVE_KEYWORDS);

  // Frontend / full-stack base signal (text channel, with slug channel as title-grade evidence).
  const frontendWhere = locate(title, description, FRONTEND_KEYWORDS);
  const frontendFull = slugFrontend || isReactNative;
  const frontendPts = frontendFull ? WEIGHTS.frontend : weightFor(frontendWhere, WEIGHTS.frontend);
  if (frontendPts) {
    score += frontendPts;
    reasons.push(
      frontendFull
        ? `frontend (${slugFrontend ? 'tech tags' : 'React Native'}) +${frontendPts}`
        : `frontend/full-stack (${frontendWhere}) +${frontendPts}`,
    );
  }

  // Sweet spot: frontend-SPECIFIC signal AND backend signal anywhere => my ideal profile.
  const hasFrontendOnly =
    slugFrontend ||
    matchesAny(title, FRONTEND_ONLY_KEYWORDS) ||
    matchesAny(description, FRONTEND_ONLY_KEYWORDS);
  const hasBackendSignal =
    slugBackendSignal ||
    matchesAny(title, BACKEND_SIGNAL_KEYWORDS) ||
    matchesAny(description, BACKEND_SIGNAL_KEYWORDS);
  if (hasFrontendOnly && hasBackendSignal) {
    score += WEIGHTS.fullStackSweetSpot;
    reasons.push(`FE-oriented full-stack sweet spot +${WEIGHTS.fullStackSweetSpot}`);
  }

  // Seniority: source-provided level first (structured), then text.
  if (job.seniority === 'senior') {
    score += WEIGHTS.senior;
    reasons.push(`senior (source) +${WEIGHTS.senior}`);
  } else {
    const seniorWhere = locate(title, description, SENIOR_KEYWORDS);
    const seniorPts = weightFor(seniorWhere, WEIGHTS.senior);
    if (seniorPts) {
      score += seniorPts;
      reasons.push(`senior (${seniorWhere}) +${seniorPts}`);
    }
  }

  // React Native — the candidate's main skill, so an RN role outranks everything else.
  if (isReactNative) {
    score += WEIGHTS.reactNative;
    reasons.push(`React Native +${WEIGHTS.reactNative}`);
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
  // When curated slugs exist they DECIDE this signal: penalize only if backend slugs appear with
  // no frontend slug (a `python` tag alongside `react`+`nodejs` is normal for FE-oriented
  // full-stack and must not sink the job). Text matching is the fallback for slug-less jobs.
  if (slugs.length > 0) {
    if (slugBackendPrimary && !slugFrontend) {
      score += WEIGHTS.backendPrimaryPenalty;
      reasons.push(`backend-primary (tech tags) ${WEIGHTS.backendPrimaryPenalty}`);
    }
  } else {
    const backendWhere = locate(title, description, BACKEND_PRIMARY_KEYWORDS);
    const backendPts = weightFor(backendWhere, WEIGHTS.backendPrimaryPenalty);
    if (backendPts) {
      score += backendPts;
      reasons.push(`backend-primary (${backendWhere}) ${backendPts}`);
    }
  }

  // Other disqualifiers (DevOps/SRE/data-eng/Angular-only/junior/intern). A source-provided
  // 'junior' seniority is the same disqualifier, structured.
  if (job.seniority === 'junior') {
    score += WEIGHTS.backendPrimaryPenalty;
    reasons.push(`junior (source) ${WEIGHTS.backendPrimaryPenalty}`);
  } else {
    const negativeWhere = locate(title, description, NEGATIVE_KEYWORDS);
    const negativePts = weightFor(negativeWhere, WEIGHTS.backendPrimaryPenalty);
    if (negativePts) {
      score += negativePts;
      reasons.push(`disqualifier (${negativeWhere}) ${negativePts}`);
    }
  }

  // Team-lead / engineering-management ROLE penalty — the candidate is a hands-on senior IC.
  // WAIVED when React Native is present: an RN lead is the one lead role worth surfacing (mirrors
  // the EXCEPTION in the LLM scorer's prompt).
  if (!isReactNative) {
    const leadWhere = locate(title, description, LEAD_ROLE_KEYWORDS);
    const leadPts = weightFor(leadWhere, WEIGHTS.backendPrimaryPenalty);
    if (leadPts) {
      score += leadPts;
      reasons.push(`team-lead role, not React Native (${leadWhere}) ${leadPts}`);
    }
  }

  return {
    score: clamp(score),
    why: reasons.length > 0 ? reasons.join('; ') : 'no matching signals',
    relevant: true, // keyword scorer never drops on role type; only the LLM scorer does
  };
}
