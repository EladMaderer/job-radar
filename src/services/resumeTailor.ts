import Anthropic from '@anthropic-ai/sdk';
import {
  LLM_TIMEOUT_MS,
  TAILOR_MAX_TOKENS,
  TAILOR_MODEL,
  TAILOR_OUTPUT_SCHEMA,
  TAILOR_SYSTEM_PROMPT,
} from '../constants/resume.js';
import { parseResumeContent, type ChatMsg, type ResumeContent } from './resumeContent.js';
import type { TailorChange } from '../repositories/tailorRepository.js';

/**
 * Per-job resume tailoring. Token-bounded conversation design: the base resume + JD go in turn 1,
 * history is replayed as SUMMARIES (never full JSON), and only the CURRENT content JSON rides
 * along in the final turn — so cost stays flat as the chat grows.
 */

export interface TailorArgs {
  jobDescription: string;
  company: string;
  title: string;
  baseContent: ResumeContent; // the captured original — never mutated
  currentContent: ResumeContent | null; // latest tailored version; null on first generate
  history: ChatMsg[];
  message: string | null; // null = initial generate
}

export interface TailorResult {
  content: ResumeContent;
  changes: TailorChange[];
  note: string;
}

export function createResumeTailor(apiKey: string) {
  const client = new Anthropic({ apiKey, timeout: LLM_TIMEOUT_MS });

  return {
    async tailor(args: TailorArgs): Promise<TailorResult> {
      const turns: Anthropic.MessageParam[] = [
        {
          role: 'user',
          content:
            `JOB: ${args.title} at ${args.company}\n\nJOB DESCRIPTION:\n${args.jobDescription}\n\n` +
            `BASE RESUME (JSON):\n${JSON.stringify(args.baseContent)}`,
        },
        ...args.history.map((m): Anthropic.MessageParam => ({ role: m.role, content: m.text })),
        {
          role: 'user',
          content: args.currentContent
            ? `CURRENT TAILORED RESUME (JSON):\n${JSON.stringify(args.currentContent)}\n\nREQUEST: ${
                args.message ?? 'Improve the tailoring further.'
              }`
            : 'Produce the initial tailored version of the resume for this job.',
        },
      ];

      const stream = client.messages.stream({
        model: TAILOR_MODEL,
        max_tokens: TAILOR_MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system: TAILOR_SYSTEM_PROMPT,
        output_config: { format: { type: 'json_schema', schema: TAILOR_OUTPUT_SCHEMA } },
        messages: turns,
      });
      const message = await stream.finalMessage();

      if (message.stop_reason === 'max_tokens') {
        throw new Error('Model output was truncated — please retry.');
      }
      const text = message.content.find((b) => b.type === 'text');
      if (!text || text.type !== 'text') throw new Error('Tailor: no text block in model response');
      const parsed = JSON.parse(text.text) as {
        content: unknown;
        changes: TailorChange[];
        note: string;
      };
      return {
        content: parseResumeContent(parsed.content),
        changes: parsed.changes,
        note: parsed.note,
      };
    },
  };
}
