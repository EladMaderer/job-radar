/**
 * Resume tailoring constants: per-task models, limits, structured-output schemas, and prompts.
 * All strings live here (house rule); the services contain only logic.
 *
 * Models are cost-tiered per task: design capture (vision, once per upload) and tailoring (goes
 * to real employers) use Sonnet; interview prep is a plain text task on Haiku. Each is
 * env-overridable — e.g. RESUME_CAPTURE_MODEL=claude-opus-4-8 for a one-off premium re-capture.
 */
export const CAPTURE_MODEL = process.env.RESUME_CAPTURE_MODEL ?? 'claude-sonnet-5';
export const TAILOR_MODEL = process.env.RESUME_TAILOR_MODEL ?? 'claude-sonnet-5';
export const PREP_MODEL = process.env.RESUME_PREP_MODEL ?? 'claude-haiku-4-5';

export const MAX_PDF_BYTES = 3 * 1024 * 1024; // Vercel body limit is 4.5MB; base64 adds ~33%
export const MAX_CAPTURE_PAGES = 3;
export const MAX_TAILOR_MESSAGES = 20; // chat history cap (drop oldest pair beyond this)
export const CAPTURE_MAX_TOKENS = 32000;
export const TAILOR_MAX_TOKENS = 32000;
export const PREP_MAX_TOKENS = 4000;
export const LLM_TIMEOUT_MS = 280_000; // give up before Vercel's 300s maxDuration kills the fn

/** Optional-as-null helper: structured outputs require every property; null encodes absence. */
const NULLABLE_STRING = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;

/**
 * The fixed resume content schema. The renderer walks exactly this shape; the capture LLM fills
 * it; the tailor LLM edits it. Structured-output rules: additionalProperties:false everywhere,
 * every property required, optionality via anyOf-null, no length/numeric constraints.
 */
export const RESUME_CONTENT_SCHEMA = {
  type: 'object',
  properties: {
    header: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        title: NULLABLE_STRING,
        contacts: { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'title', 'contacts'],
      additionalProperties: false,
    },
    layout: {
      type: 'object',
      properties: {
        columns: { type: 'integer', enum: [1, 2] },
        sidebar: { type: 'array', items: { type: 'string' } },
      },
      required: ['columns', 'sidebar'],
      additionalProperties: false,
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          heading: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: NULLABLE_STRING,
                subtitle: NULLABLE_STRING,
                meta: NULLABLE_STRING,
                text: NULLABLE_STRING,
                bullets: { type: 'array', items: { type: 'string' } },
              },
              required: ['title', 'subtitle', 'meta', 'text', 'bullets'],
              additionalProperties: false,
            },
          },
        },
        required: ['id', 'heading', 'items'],
        additionalProperties: false,
      },
    },
  },
  required: ['header', 'layout', 'sections'],
  additionalProperties: false,
} as const;

export const CAPTURE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    content: RESUME_CONTENT_SCHEMA,
    css: { type: 'string' },
    fontLinks: { type: 'array', items: { type: 'string' } },
  },
  required: ['content', 'css', 'fontLinks'],
  additionalProperties: false,
} as const;

export const TAILOR_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    content: RESUME_CONTENT_SCHEMA,
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { where: { type: 'string' }, what: { type: 'string' } },
        required: ['where', 'what'],
        additionalProperties: false,
      },
    },
    note: { type: 'string' },
  },
  required: ['content', 'changes', 'note'],
  additionalProperties: false,
} as const;

/**
 * The fixed HTML skeleton contract the renderer emits and the captured CSS must target. Shared
 * between the renderer implementation and the capture prompt so they can never drift apart.
 */
export const SKELETON_CONTRACT = `The HTML document structure is FIXED (you cannot change it):
<div class="resume">
  <header class="header">
    <div class="name">…</div>
    <div class="title">…</div>            <!-- omitted when null -->
    <div class="contacts"><span class="contact">…</span>…</div>
  </header>
  <div class="body">                       <!-- when layout.columns=2: contains .sidebar and .main -->
    <div class="sidebar">…sections whose id is in layout.sidebar…</div>
    <div class="main">…all other sections…</div>
  </div>                                   <!-- when layout.columns=1: sections are direct children of .body -->
</div>
Each section renders as:
<section class="section section-{id}">
  <h2 class="heading">…</h2>
  <div class="item">
    <div class="item-title">…</div>        <!-- each field omitted when null -->
    <div class="item-subtitle">…</div>
    <div class="item-meta">…</div>
    <p class="item-text">…</p>
    <ul class="bullets"><li class="bullet">…</li>…</ul>
  </div>
</section>`;

export const CAPTURE_SYSTEM_PROMPT = `You convert a resume PDF into (1) structured content JSON and (2) a CSS stylesheet that makes a fixed HTML skeleton reproduce the PDF's visual design as faithfully as possible. You receive page images (the ground truth for the design) and extracted text (a hint for content accuracy — its reading order may be jumbled for multi-column layouts; trust the images for layout and the text for exact wording).

${SKELETON_CONTRACT}

CONTENT rules:
- Transcribe the resume content EXACTLY — never invent, summarize, or "improve" anything.
- Give each section a short stable slug id (e.g. "experience", "skills", "education").
- Use layout.columns=2 and layout.sidebar=[ids] only if the design truly has a sidebar column.

CSS rules:
- Target ONLY the skeleton classes above. No images, no absolute positioning, no JavaScript.
- Reproduce fonts, sizes, weights, colors, spacing, dividers, and column proportions from the page images.
- Map the PDF's fonts to the closest Google Fonts families; return their css2 stylesheet URLs in fontLinks (e.g. https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap). Use those families in the CSS with sensible fallbacks.
- Do NOT emit @page (the renderer owns page size and margins are zero); express the document margin as padding on .resume.
- For 2-column layouts, design so the sidebar content fits on page one (standard for resume templates).
- The stylesheet must be self-contained and deterministic.`;

export const CAPTURE_REFINE_INSTRUCTION = `Revise the css (and layout/fontLinks if needed) per the user's request. Return content UNCHANGED unless the user explicitly asked for a content correction (e.g. a transcription mistake). Return the complete updated result.`;

export const TAILOR_SYSTEM_PROMPT = `Act as an elite Tech Recruiter. Reverse engineer this job description and match it with my resume to help me prepare a resume for this specific role.

HARD RULES — NO FABRICATION. You are rewriting an existing resume, not writing a new one.
- Never invent employers, job titles, employment dates, education, certifications, or numbers/metrics that do not appear in the base resume.
- Never add a technology, framework, tool, or skill the base resume does not contain.
- You MAY: rephrase and tighten bullets, reorder sections and bullets to lead with what this job values, drop or shorten less-relevant items, and mirror the job description's terminology ONLY where the base resume demonstrates the equivalent experience.
- Every statement in your output must be traceable to the base resume. If the job requires something the candidate does not have, do not fake it — emphasize the closest real experience instead.

STRUCTURE rules:
- Keep header.name and header.contacts exactly as in the base resume.
- Keep every section id unchanged (the stylesheet targets them). You may reorder sections and items.
- Keep total length close to the base resume so the layout still fits its page(s).
- Keep bullets concise (roughly the length of the originals).

OUTPUT: the complete tailored content JSON; changes = each meaningful edit as {where: "section/item", what: "one-line description"}; note = one or two sentences on the overall tailoring strategy.`;

export const PREP_SYSTEM_PROMPT = `Act as an elite Tech Recruiter.
Reverse engineer this job description and help me prepare for the interview.
Provide a highly strategic, no-BS breakdown of:
1. THE REAL PAIN POINTS: 3 critical challenges or bottlenecks the hiring manager is facing that triggered this hiring need.
2. THE QUESTIONS: 3 tough behavioral questions they will likely ask to test if I can solve these exact pain points.

Format the answer in clean markdown with clear headings.`;
