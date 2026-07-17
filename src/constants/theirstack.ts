/**
 * TheirStack query constants. Every job RETURNED costs 1 API credit. On the PAID tier (1,500
 * credits/month) the filters are tuned for RECALL, not budget: a broad React/frontend title set,
 * no seniority pre-filter (the LLM scorer judges seniority far better than TheirStack's tags), and
 * only our own registry companies excluded server-side (the ATS poller covers them free).
 *
 * Measured (blurred probes, 2026-07): this set with no seniority filter ≈ 334 jobs/month — ~22% of
 * the 1,500 budget. Deliberately still NOT bare "Software Engineer" — kept React/frontend-focused
 * so the dashboard isn't flooded with LLM-rejected noise.
 */
export const THEIRSTACK_JOB_TITLES = [
  'Frontend Engineer',
  'Frontend Developer',
  'Front End Developer',
  'Front End Engineer',
  'Fullstack Engineer',
  'Fullstack Developer',
  'Full Stack Engineer',
  'Full Stack Developer',
  'React Developer',
  'React Engineer',
  'React Native Developer', // React Native is the candidate's main skill — scorer weights it highest
  'React Native Engineer',
  'Web Developer',
  'Web Engineer',
  'UI Engineer',
  'UI Developer',
  'Mobile Developer', // catches React Native roles titled generically; LLM drops native-only ones
  'Mobile Engineer',
];

/**
 * Bare generic-engineer titles, added only when THEIRSTACK_BROAD_TITLES=true. "Software Engineer" is
 * exactly the title that hides React roles behind a generic name — the recall the paid tier is for —
 * but it also pulls the most noise, so it's gated: enable ONLY with the LLM scorer confirmed live.
 */
export const THEIRSTACK_BROAD_TITLES = [
  'Software Engineer',
  'Software Developer',
  'Senior Software Engineer',
];

export const THEIRSTACK_COUNTRY_CODES = ['IL'];

/**
 * Posted-age window for the FIRST run only (no watermark yet) — i.e. a fresh seed / backfill. The
 * incremental watermark only ever sees jobs discovered *after* run #1, so the backlog of
 * already-open roles is only catchable here. 60 days ≈ 686 credits (measured), a comfortable
 * one-time cost on the paid tier. Ongoing runs use THEIRSTACK_MAX_AGE_DAYS (14) via the watermark.
 */
export const THEIRSTACK_FIRST_RUN_MAX_AGE_DAYS = 60;

/**
 * Overlap subtracted from the discovered_at watermark so boundary jobs aren't missed. Trimmed to
 * 30 min for the every-2h cadence — frequent runs need little margin, and a smaller overlap means
 * fewer re-billed boundary jobs.
 */
export const THEIRSTACK_WATERMARK_OVERLAP_MS = 30 * 60 * 1000; // 30 minutes
