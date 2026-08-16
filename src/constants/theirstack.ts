/**
 * TheirStack query constants. Every job RETURNED costs 1 API credit.
 *
 * ⚠️ NOW ON THE FREE TIER (200 credits/month) — but this title set was tuned for RECALL on the paid
 * tier: broad React/frontend titles, no seniority pre-filter (the LLM scorer judges seniority far
 * better than TheirStack's tags), only registry companies excluded server-side.
 *
 * Measured (blurred probes, 2026-07): ≈ 334 jobs/month — comfortably 22% of the old 1,500 budget,
 * but ~167% of the free tier's 200. Expect the credit guard to halt runs partway through a period
 * (it stops cleanly and warns; it never overspends). To fit inside 200, trim THEIRSTACK_JOB_TITLES
 * to the highest-signal entries — React Native / React / Frontend — and drop the generic catch-alls
 * ("Web Developer", "Mobile Developer", "Fullstack…"), which pull the most volume per unit of fit.
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
 * Overlap subtracted from the discovered_at watermark so boundary jobs aren't missed.
 *
 * MUST stay well under the run interval: the overlap window is re-fetched every run, and every job
 * returned costs a credit even if we already stored it. At the old every-2h cadence a 30-min
 * overlap re-scanned 25% of each window; on the hourly Sun–Thu schedule that would be 50% — so it
 * drops to 10 min (~17%), keeping credit use flat while runs nearly double. Hourly runs need less
 * margin anyway: the next run is only an hour behind, not four.
 */
export const THEIRSTACK_WATERMARK_OVERLAP_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Closure reconciliation (Step 2): re-check the closure status of stored TheirStack jobs so ones
 * that go "no longer accepting applications" get hidden, and reopened ones return. Credit-cheap by
 * design — TheirStack bills per job RETURNED and we query BY is_closed state (job_id_or + is_closed),
 * so a pass only spends credits for jobs that actually changed state, not for every job checked.
 * These bound the worst case (every re-checked job flipped state) and keep id lists under the page cap.
 */
export const THEIRSTACK_RECONCILE_ID_BATCH = 200; // job ids per job_id_or request (< the 500/page cap)
export const THEIRSTACK_RECONCILE_MAX = 400; // hard cap on ids re-checked per cycle, per direction
