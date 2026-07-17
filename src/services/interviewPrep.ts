import Anthropic from '@anthropic-ai/sdk';
import {
  LLM_TIMEOUT_MS,
  PREP_MAX_TOKENS,
  PREP_MODEL,
  PREP_SYSTEM_PROMPT,
} from '../constants/resume.js';
import type { ResumeContent } from './resumeContent.js';

/**
 * One-shot interview prep brief (markdown). Plain text task on the cheap model; the candidate's
 * resume content rides along as context when available so the pain-point analysis can connect to
 * their actual background.
 */
export function createInterviewPrep(apiKey: string) {
  const client = new Anthropic({ apiKey, timeout: LLM_TIMEOUT_MS });

  return {
    async generate(args: {
      jobDescription: string;
      company: string;
      title: string;
      resumeContent: ResumeContent | null;
    }): Promise<string> {
      const parts = [
        `JOB: ${args.title} at ${args.company}`,
        `JOB DESCRIPTION:\n${args.jobDescription}`,
      ];
      if (args.resumeContent) {
        parts.push(`CANDIDATE RESUME (context):\n${JSON.stringify(args.resumeContent)}`);
      }
      const message = await client.messages.create({
        model: PREP_MODEL,
        max_tokens: PREP_MAX_TOKENS,
        system: PREP_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: parts.join('\n\n') }],
      });
      const text = message.content.find((b) => b.type === 'text');
      if (!text || text.type !== 'text') throw new Error('Prep: no text block in model response');
      return text.text;
    },
  };
}
