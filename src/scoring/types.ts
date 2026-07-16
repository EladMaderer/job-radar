import type { Job } from '../ats/types.js';

export interface ScoreResult {
  score: number; // clamped 0-100
  why: string; // human-readable list of matched rules
}

/**
 * Scores a job against my profile. Keyword v1 today; a Phase 3 LLM scorer implements the same
 * interface and drops in without touching callers.
 */
export interface Scorer {
  score(job: Job): ScoreResult;
}
