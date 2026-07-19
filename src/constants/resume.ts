/**
 * Resume-guidance + interview-prep constants: models, limits, prompts. Both are plain text tasks
 * (markdown out), so no structured-output schemas. Models are cheap and env-overridable.
 */
export const GUIDANCE_MODEL = process.env.RESUME_GUIDANCE_MODEL ?? 'claude-sonnet-5';
export const PREP_MODEL = process.env.RESUME_PREP_MODEL ?? 'claude-haiku-4-5';

export const MAX_PDF_BYTES = 3 * 1024 * 1024; // Vercel body limit is 4.5MB; base64 adds ~33%
export const MAX_RESUME_TEXT_CHARS = 20000; // bound the resume text sent to the LLM
export const GUIDANCE_MAX_TOKENS = 1600; // stay short — backstop the brevity prompt
export const PREP_MAX_TOKENS = 1600; // interview prep must stay short — backstop the brevity prompt
export const LLM_TIMEOUT_MS = 280_000; // give up before Vercel's 300s maxDuration kills the fn

export const GUIDANCE_SYSTEM_PROMPT = `Act as an elite Tech Recruiter. Read the job description against my resume + private context and tell me — briefly — how to adjust my resume for THIS role. I'll edit it myself.

Output exactly these three short markdown sections, nothing else:
## Emphasize
- The 3–5 things this role values MOST. Each: **<the JD's own keyword/skill>** — one short line on how to surface it (only where my resume genuinely supports it).
## Cut / downplay
- 1–3 things on my resume that don't matter for this role and just dilute it.
## Honest match
- 1–3 lines: where I genuinely fit (lead with these); and any spot where the resume overstates vs my real experience — how to phrase it truthfully.

BE CONCISE — scannable in under a minute. No intro, no summary, no filler. Tight bullets, one line each, no sub-bullets. Never suggest claiming experience my resume + context don't support, and do NOT rewrite the resume.`;

export const PREP_SYSTEM_PROMPT = `Act as an elite Tech Recruiter. Reverse engineer this job description and help me prep for the interview. Give a sharp, no-BS breakdown of exactly two things:
1. THE REAL PAIN POINTS: the 3 critical challenges/bottlenecks the hiring manager is facing that triggered this hire.
2. THE QUESTIONS: the 3 tough behavioral questions they'll likely ask to test if I can solve those pain points.

BE CONCISE — this must be scannable in under a minute. Rules:
- No intro, no summary, no filler, no closing pep talk. Start straight at "## The Real Pain Points".
- Each pain point: ONE sentence.
- Each question: the question in quotes, then ONE short line on what it's really testing.
- Exactly two markdown headings, tight bullets, nothing else.

If given PRIVATE CONTEXT about my real depth of experience, add at most ONE short line flagging a weak spot I may be probed on. Otherwise omit it.`;
