import { HTTP_TIMEOUT_MS } from '../constants/http.js';
import {
  LINKEDIN_BROWSER_UA,
  LINKEDIN_CLOSED_PHRASE,
  LINKEDIN_GUEST_JOB_ENDPOINT,
} from '../constants/linkedin.js';

export type AcceptingStatus = 'open' | 'closed' | 'unknown';

/**
 * The numeric LinkedIn job id from a job-view URL, or null if the URL isn't a LinkedIn posting.
 * Handles both slug URLs (…/jobs/view/senior-dev-at-acme-4440506510) and bare id URLs
 * (…/jobs/view/4440506510). The greedy prefix ensures digits inside the slug aren't mistaken for
 * the id — only the trailing run of digits is the job id.
 */
export function linkedInJobId(url: string): string | null {
  const match = /linkedin\.com\/jobs\/view\/(?:[^/?#]*-)?(\d+)/i.exec(url);
  return match?.[1] ?? null;
}

/** Whether a job URL points at a LinkedIn posting we can closure-check. */
export function isLinkedInJob(url: string): boolean {
  return linkedInJobId(url) !== null;
}

/**
 * Read whether a LinkedIn posting is still accepting applications from its PUBLIC guest page.
 * - 'closed': the page loaded AND shows the "no longer accepting applications" phrase.
 * - 'open':   the page loaded WITHOUT that phrase.
 * - 'unknown': not a LinkedIn URL, or any error/block (non-200, timeout, network) — the caller
 *   MUST NOT hide a job on 'unknown'. No retry: a datacenter block won't recover within a run, and
 *   hammering the endpoint only invites a harder block.
 */
export async function linkedInAcceptingStatus(url: string): Promise<AcceptingStatus> {
  const id = linkedInJobId(url);
  if (!id) return 'unknown';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(`${LINKEDIN_GUEST_JOB_ENDPOINT}/${id}`, {
      headers: { 'user-agent': LINKEDIN_BROWSER_UA, accept: 'text/html' },
      signal: controller.signal,
    });
    if (!res.ok) return 'unknown';
    const html = await res.text();
    return LINKEDIN_CLOSED_PHRASE.test(html) ? 'closed' : 'open';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}
