/**
 * LinkedIn closure check. TheirStack's `closed_at` only fires when a posting is REMOVED from the
 * source — it does not reflect LinkedIn's "No longer accepting applications" state, which LinkedIn
 * shows while the post is still listed. That truth lives only on LinkedIn's PUBLIC guest job page
 * (no auth), so we read it there for LinkedIn-hosted postings.
 *
 * Volume is tiny (only the handful of visible LinkedIn jobs, every 2h). It's a public unauthenticated
 * endpoint, but a datacenter IP (e.g. GitHub Actions) may still be blocked — callers treat any
 * non-200/error as 'unknown' and NEVER hide a job on uncertainty.
 */
export const LINKEDIN_GUEST_JOB_ENDPOINT =
  'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting';

/** The phrase LinkedIn renders on a posting that has stopped accepting applications. */
export const LINKEDIN_CLOSED_PHRASE = /no longer accepting applications/i;

/** A real browser UA — the default bot UA gets an immediate LinkedIn block. */
export const LINKEDIN_BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const LINKEDIN_CHECK_CONCURRENCY = 3; // a few page fetches in flight — polite, avoids a burst
export const LINKEDIN_RECHECK_MAX = 60; // cap LinkedIn page fetches per direction per cycle
