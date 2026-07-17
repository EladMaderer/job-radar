import Anthropic from '@anthropic-ai/sdk';
import {
  CAPTURE_MAX_TOKENS,
  CAPTURE_MODEL,
  CAPTURE_OUTPUT_SCHEMA,
  CAPTURE_REFINE_INSTRUCTION,
  CAPTURE_SYSTEM_PROMPT,
  LLM_TIMEOUT_MS,
} from '../constants/resume.js';
import { parseResumeContent, type ChatMsg, type ResumeContent } from './resumeContent.js';

/**
 * Design capture: page images (vision ground truth) + extracted text (content hint) -> content
 * JSON + CSS + font links. Streaming (`stream().finalMessage()`) because 32K max_tokens with
 * adaptive thinking sits above the non-streaming comfort zone.
 */

export interface CapturePageImage {
  imageBase64: string; // raw base64 JPEG, no data: prefix
}

export interface CaptureResult {
  content: ResumeContent;
  css: string;
  fontLinks: string[];
}

type ContentBlock =
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } }
  | { type: 'text'; text: string };

function imageBlocks(pages: CapturePageImage[]): ContentBlock[] {
  return pages.map((p) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: p.imageBase64 },
  }));
}

/** Parse + validate the model's structured output; throw clean errors for the API layer. */
function parseCaptureOutput(message: Anthropic.Message): CaptureResult {
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Model output was truncated — please retry.');
  }
  const text = message.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Capture: no text block in model response');
  const parsed = JSON.parse(text.text) as { content: unknown; css: string; fontLinks: string[] };
  return {
    content: parseResumeContent(parsed.content),
    css: parsed.css,
    fontLinks: parsed.fontLinks,
  };
}

export function createResumeCapturer(apiKey: string) {
  const client = new Anthropic({ apiKey, timeout: LLM_TIMEOUT_MS });

  async function run(messages: Anthropic.MessageParam[]): Promise<CaptureResult> {
    const stream = client.messages.stream({
      model: CAPTURE_MODEL,
      max_tokens: CAPTURE_MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system: CAPTURE_SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: CAPTURE_OUTPUT_SCHEMA } },
      messages,
    });
    return parseCaptureOutput(await stream.finalMessage());
  }

  return {
    /** Initial capture from page images + extracted text. */
    capture(pages: CapturePageImage[], extractedText: string): Promise<CaptureResult> {
      return run([
        {
          role: 'user',
          content: [
            ...imageBlocks(pages),
            {
              type: 'text',
              text: `EXTRACTED TEXT (content hint — reading order may be jumbled for multi-column pages):\n${extractedText}`,
            },
          ],
        },
      ]);
    },

    /** Refine the captured design per a user request; images re-sent as ground truth. */
    refine(
      pages: CapturePageImage[],
      current: CaptureResult,
      history: ChatMsg[],
      message: string,
    ): Promise<CaptureResult> {
      const turns: Anthropic.MessageParam[] = [
        {
          role: 'user',
          content: [
            ...imageBlocks(pages),
            { type: 'text', text: 'These are the original resume pages (design ground truth).' },
          ],
        },
        // Replay prior refine requests as plain text so the model sees the design conversation.
        ...history.map((m): Anthropic.MessageParam => ({
          role: m.role,
          content: m.role === 'assistant' ? 'Updated the design.' : m.text,
        })),
        {
          role: 'user',
          content:
            `CURRENT CSS:\n${current.css}\n\nCURRENT CONTENT (JSON):\n${JSON.stringify(current.content)}\n\n` +
            `CURRENT FONT LINKS: ${JSON.stringify(current.fontLinks)}\n\n` +
            `USER REQUEST: ${message}\n\n${CAPTURE_REFINE_INSTRUCTION}`,
        },
      ];
      return run(turns);
    },
  };
}
