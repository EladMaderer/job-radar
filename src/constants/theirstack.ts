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
 * Posted-age window for the FIRST run only (no watermark yet). The first run is a silent baseline
 * seed — burning half the monthly credits on jobs that will never alert is waste, so keep it short;
 * the watermark takes over from run #2.
 */
export const THEIRSTACK_FIRST_RUN_MAX_AGE_DAYS = 2;

/** Overlap subtracted from the discovered_at watermark so boundary jobs aren't missed. */
export const THEIRSTACK_WATERMARK_OVERLAP_MS = 60 * 60 * 1000; // 1 hour
