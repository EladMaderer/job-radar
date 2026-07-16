/**
 * TheirStack query constants. Every job RETURNED costs 1 API credit (free tier: 200/month), so
 * these filters are the budget: tight titles, Israel only, and our own registry companies excluded
 * server-side (the free ATS poller already covers them — never pay for those jobs).
 *
 * "Software Engineer" is deliberately NOT in the title list — Israel-wide it would exhaust the
 * free tier in days (user decision). Widen only after observing the real burn rate.
 */
export const THEIRSTACK_JOB_TITLES = [
  'Frontend Engineer',
  'Frontend Developer',
  'Front End Developer',
  'Front End Engineer',
  'React Developer',
  'React Engineer',
  'React Native Developer',
  'React Native Engineer',
  'Full Stack Engineer',
  'Full Stack Developer',
];

export const THEIRSTACK_COUNTRY_CODES = ['IL'];

/**
 * Server-side seniority filter — the decisive budget lever. Measured with free blurred probes
 * (2026-07): all seniorities ≈ 136 jobs/14d (~300-450/month, 2x the free tier); senior/staff ≈
 * 52/14d (~110/month, inside budget). Mid-level roles are the excluded bulk — acceptable for a
 * senior (10+ yrs) profile, and the ATS poller still covers every seniority at its companies free.
 */
export const THEIRSTACK_SENIORITIES = ['senior', 'staff', 'c_level'];

/**
 * Posted-age window for the FIRST run only (no watermark yet) — i.e. a fresh seed / backfill. This
 * is the one chance to capture the backlog of jobs that were ALREADY OPEN when we started: the
 * incremental watermark only ever sees jobs discovered *after* run #1, so anything older is
 * invisible forever unless this window caught it. 33 days ≈ the useful shelf-life of an open role;
 * measured at ~116 matching jobs with the seniority filter — safely under the 5-page / 125-job
 * cap (truncation would be permanent: the watermark jumps to now, so overflow is never re-fetched)
 * and inside the 200/month free tier. A shorter window silently drops still-open roles — exactly
 * the Clover-Security miss that prompted this. Ongoing runs still use THEIRSTACK_MAX_AGE_DAYS (14)
 * via the watermark.
 */
export const THEIRSTACK_FIRST_RUN_MAX_AGE_DAYS = 33;

/** Overlap subtracted from the discovered_at watermark so boundary jobs aren't missed. */
export const THEIRSTACK_WATERMARK_OVERLAP_MS = 60 * 60 * 1000; // 1 hour
