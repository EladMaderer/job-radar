import type { Job } from '../ats/types.js';

export interface ScoreResult {
  score: number; // clamped 0-100
  why: string; // human-readable list of matched rules / justification
  /** false = drop the role entirely (not stored). The keyword scorer always returns true;
   * only the LLM scorer judges role relevance. */
  relevant: boolean;
}

/**
 * Scores a job against the candidate profile. Async so an LLM scorer fits the same interface as
 * the keyword scorer; callers await either.
 */
export interface Scorer {
  score(job: Job): Promise<ScoreResult>;
}
