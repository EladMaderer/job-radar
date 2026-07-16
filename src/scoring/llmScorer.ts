import Anthropic from '@anthropic-ai/sdk';
import type { Job } from '../ats/types.js';
import { renderJobForScoring, SCORER_SYSTEM_PROMPT } from '../constants/profile.js';
import { SCORE_MAX, SCORE_MIN } from '../constants/scoring.js';
import type { Scorer, ScoreResult } from './types.js';

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 400;

/** Structured-output schema — the model must return exactly these fields. */
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    relevant: { type: 'boolean' },
    score: { type: 'integer' },
    why: { type: 'string' },
  },
  required: ['relevant', 'score', 'why'],
  additionalProperties: false,
} as const;

interface LlmScore {
  relevant: boolean;
  score: number;
  why: string;
}

const clamp = (n: number): number => Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(n)));

/**
 * LLM scorer (Claude Haiku 4.5). Reads the whole job against the candidate profile and returns a
 * score, a `relevant` flag (false => drop the role), and a one-line justification — judgment the
 * keyword scorer can't do (role focus, candidate qualification). Structured outputs guarantee the
 * response parses.
 */
export function createLlmScorer(apiKey: string): Scorer {
  const client = new Anthropic({ apiKey });

  return {
    async score(job: Job): Promise<ScoreResult> {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SCORER_SYSTEM_PROMPT,
        output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        messages: [{ role: 'user', content: renderJobForScoring(job) }],
      });

      const text = message.content.find((b) => b.type === 'text');
      if (!text || text.type !== 'text') {
        throw new Error('LLM scorer: no text block in response');
      }
      const parsed = JSON.parse(text.text) as LlmScore;

      return {
        score: clamp(parsed.score),
        why: parsed.why,
        relevant: parsed.relevant,
      };
    },
  };
}
