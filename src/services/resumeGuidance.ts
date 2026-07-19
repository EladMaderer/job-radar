import Anthropic from '@anthropic-ai/sdk';
import {
  GUIDANCE_MAX_TOKENS,
  GUIDANCE_MODEL,
  GUIDANCE_SYSTEM_PROMPT,
  LLM_TIMEOUT_MS,
  MAX_RESUME_TEXT_CHARS,
} from '../constants/resume.js';

/**
 * Resume guidance: read a job description against the candidate's resume text + private context
 * and return a markdown brief on what to emphasize/cut/position honestly. The candidate edits
 * their own resume from it — we never rewrite the resume.
 */
export function createResumeGuidance(apiKey: string) {
  const client = new Anthropic({ apiKey, timeout: LLM_TIMEOUT_MS });

  return {
    async generate(args: {
      jobDescription: string;
      company: string;
      title: string;
      resumeText: string | null;
      context: string | null;
    }): Promise<string> {
      const parts = [
        `JOB: ${args.title} at ${args.company}`,
        `JOB DESCRIPTION:\n${args.jobDescription}`,
      ];
      if (args.resumeText) {
        parts.push(`CANDIDATE RESUME (text):\n${args.resumeText.slice(0, MAX_RESUME_TEXT_CHARS)}`);
      }
      if (args.context) {
        parts.push(`PRIVATE CONTEXT — the candidate's real depth of experience:\n${args.context}`);
      }
      const message = await client.messages.create({
        model: GUIDANCE_MODEL,
        max_tokens: GUIDANCE_MAX_TOKENS,
        system: GUIDANCE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: parts.join('\n\n') }],
      });
      const text = message.content.find((b) => b.type === 'text');
      if (!text || text.type !== 'text')
        throw new Error('Guidance: no text block in model response');
      return text.text;
    },
  };
}
