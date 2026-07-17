import { z } from 'zod';

/**
 * TypeScript/zod mirror of RESUME_CONTENT_SCHEMA (src/constants/resume.ts). The JSON schema
 * constrains the LLM's output at the API layer; this validates everything that crosses our own
 * boundaries (DB reads, request bodies) and gives the codebase typed content.
 */

export const resumeItemSchema = z.object({
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  meta: z.string().nullable(),
  text: z.string().nullable(),
  bullets: z.array(z.string()),
});

export const resumeSectionSchema = z.object({
  id: z.string().min(1),
  heading: z.string(),
  items: z.array(resumeItemSchema),
});

export const resumeContentSchema = z.object({
  header: z.object({
    name: z.string().min(1),
    title: z.string().nullable(),
    contacts: z.array(z.string()),
  }),
  layout: z.object({
    columns: z.union([z.literal(1), z.literal(2)]),
    sidebar: z.array(z.string()),
  }),
  sections: z.array(resumeSectionSchema),
});

export type ResumeItem = z.infer<typeof resumeItemSchema>;
export type ResumeSection = z.infer<typeof resumeSectionSchema>;
export type ResumeContent = z.infer<typeof resumeContentSchema>;

/** Shared chat-message shape for capture and tailor histories (stored as JSONB). */
export interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  at: string; // ISO timestamp
}

export const chatMsgSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  at: z.string(),
});

/** Parse untrusted content (LLM output, DB row, request body); throws with a clear message. */
export function parseResumeContent(value: unknown): ResumeContent {
  const parsed = resumeContentSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Invalid resume content: ${issue ? `${issue.path.join('.')}: ${issue.message}` : 'unknown error'}`,
    );
  }
  return parsed.data;
}
