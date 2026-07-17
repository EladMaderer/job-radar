import { config } from '../config/env.js';
import { HTTP_TIMEOUT_MS, USER_AGENT, withRetry } from '../constants/http.js';
import {
  THEIRSTACK_BROAD_TITLES,
  THEIRSTACK_COUNTRY_CODES,
  THEIRSTACK_FIRST_RUN_MAX_AGE_DAYS,
  THEIRSTACK_JOB_TITLES,
  THEIRSTACK_WATERMARK_OVERLAP_MS,
} from '../constants/theirstack.js';
import { COMPANIES } from '../registry/companies.js';
import type { Job } from '../ats/types.js';

export const THEIRSTACK_SOURCE = 'theirstack';

/**
 * TheirStack market-wide job search (https://api.theirstack.com/v1/jobs/search). This is NOT an
 * AtsAdapter — it's a single market-wide fetch, run on its own slow cadence.
 *
 * CREDIT MODEL (the whole design revolves around it): 1 API credit per JOB RETURNED, free tier
 * 200/month. So we fetch incrementally — `discovered_at_gte` set from our own watermark (when we
 * last stored a theirstack row, minus 1h overlap) — so each job is returned and billed ~once. Our
 * registry companies are excluded server-side (company_name_not): the ATS poller already covers
 * them for free.
 */

interface TheirStackHiringTeamMember {
  full_name?: string | null;
  linkedin_url?: string | null;
}

interface TheirStackJob {
  id: number | string;
  job_title: string;
  url?: string | null;
  final_url?: string | null;
  company?: string | { name?: string | null } | null;
  company_object?: { name?: string | null } | null;
  location?: string | null;
  description?: string | null;
  date_posted?: string | null;
  discovered_at?: string | null;
  remote?: boolean | null;
  hybrid?: boolean | null;
  country_code?: string | null;
  technology_slugs?: string[] | null;
  seniority?: string | null;
  hiring_team?: TheirStackHiringTeamMember[] | null;
}

interface TheirStackResponse {
  data?: TheirStackJob[];
}

function companyName(raw: TheirStackJob): string {
  if (typeof raw.company === 'string' && raw.company.trim()) return raw.company.trim();
  if (raw.company && typeof raw.company === 'object' && raw.company.name?.trim()) {
    return raw.company.name.trim();
  }
  return raw.company_object?.name?.trim() || 'Unknown company';
}

function toJob(raw: TheirStackJob): Job {
  const hiring = raw.hiring_team?.[0];
  return {
    source: THEIRSTACK_SOURCE,
    externalId: String(raw.id),
    company: companyName(raw),
    title: raw.job_title.trim(),
    location: raw.location?.trim() || null,
    url: raw.final_url || raw.url || '',
    description: raw.description?.trim() || null,
    postedAt: raw.date_posted ? new Date(raw.date_posted) : null,
    remote: Boolean(raw.remote) || Boolean(raw.hybrid),
    // Trust country_code, NEVER the lat/long geo — TheirStack's geocoding has known bad data
    // (an Israeli Center-District job geocoded to Slovenia while country_code was correctly IL).
    countryCode: raw.country_code?.trim() || null,
    technologySlugs: raw.technology_slugs ?? undefined,
    seniority: raw.seniority ?? null,
    recruiterName: hiring?.full_name ?? null,
    recruiterLinkedIn: hiring?.linkedin_url ?? null,
  };
}

/**
 * One page of results, with timeout + retry (the search runs ~5s but occasionally spikes; a lone
 * hiccup must not fail the whole run — same resilience the ATS board fetches have). Retrying a
 * timed-out request is credit-safe: credits are billed per job RETURNED, and an aborted request
 * returns nothing.
 */
async function searchPage(apiKey: string, body: Record<string, unknown>): Promise<TheirStackJob[]> {
  return withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetch('https://api.theirstack.com/v1/jobs/search', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'user-agent': USER_AGENT,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      // Burn visibility: surface any rate-limit / credit headers the API exposes.
      const meterHeaders: string[] = [];
      res.headers.forEach((v, k) => {
        if (/ratelimit|credit|quota/i.test(k)) meterHeaders.push(`${k}=${v}`);
      });
      if (meterHeaders.length > 0) console.log(`[theirstack] headers: ${meterHeaders.join(' ')}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`TheirStack HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      const parsed = (await res.json()) as TheirStackResponse;
      return parsed.data ?? [];
    } finally {
      clearTimeout(timer);
    }
  });
}

/** The active title list: base React/frontend set, plus generic-engineer titles when opted in. */
function activeTitles(): string[] {
  return config.THEIRSTACK_BROAD_TITLES
    ? [...THEIRSTACK_JOB_TITLES, ...THEIRSTACK_BROAD_TITLES]
    : THEIRSTACK_JOB_TITLES;
}

/**
 * Fetch jobs discovered since `watermark` (or, on the first run, within the posted-age window).
 * `maxCredits` is a HARD cap on jobs returned this run (each = 1 credit) — the credit budget's
 * remaining balance — so a big backfill can't overshoot: pagination stops before a page would
 * exceed it, and logs the truncation. Bounded above by THEIRSTACK_MAX_PAGES.
 */
export async function fetchTheirStackJobs(
  watermark: Date | null,
  maxCredits = Number.POSITIVE_INFINITY,
): Promise<Job[]> {
  const apiKey = config.THEIRSTACK_API_KEY;
  if (!apiKey) throw new Error('THEIRSTACK_API_KEY is not set');

  const titles = activeTitles();
  const excludeCompanies = COMPANIES.map((c) => c.name);
  const body: Record<string, unknown> = {
    job_title_or: titles,
    job_country_code_or: THEIRSTACK_COUNTRY_CODES,
    // No seniority pre-filter: TheirStack's tags are unreliable (it mislabels senior roles), and
    // the LLM scorer judges seniority far better — it already drops junior/intern roles.
    // First run (no watermark) uses the wider backfill window; ongoing runs use the 14-day cap.
    posted_at_max_age_days: watermark
      ? config.THEIRSTACK_MAX_AGE_DAYS
      : THEIRSTACK_FIRST_RUN_MAX_AGE_DAYS,
    company_name_not: excludeCompanies,
    order_by: [{ field: 'discovered_at', desc: false }],
  };
  if (watermark) {
    const since = new Date(watermark.getTime() - THEIRSTACK_WATERMARK_OVERLAP_MS);
    body.discovered_at_gte = since.toISOString();
  }

  const jobs: Job[] = [];
  let capped = false;
  for (let page = 0; page < config.THEIRSTACK_MAX_PAGES; page += 1) {
    // Never fetch more than the credits left this period — trim the last page to fit.
    const budgetLeft = maxCredits - jobs.length;
    if (budgetLeft <= 0) {
      capped = true;
      break;
    }
    const pageLimit = Math.min(config.THEIRSTACK_LIMIT, budgetLeft);
    const raws = await searchPage(apiKey, { ...body, page, limit: pageLimit });
    jobs.push(...raws.map(toJob));
    console.log(
      `[theirstack] page ${page}: ${raws.length} jobs returned (≈${raws.length} credits)` +
        ` | titles=${titles.length} country=IL cap=${pageLimit}` +
        ` watermark=${watermark ? body.discovered_at_gte : 'none (first run)'}`,
    );
    if (raws.length < pageLimit) break; // last page (fewer results than we asked for)
    if (page === config.THEIRSTACK_MAX_PAGES - 1) {
      console.warn(
        `::warning::[theirstack] page cap (${config.THEIRSTACK_MAX_PAGES}) hit with full pages — ` +
          'more jobs may exist this window; raise THEIRSTACK_MAX_PAGES if this recurs.',
      );
    }
  }
  if (capped) {
    console.warn(
      `::warning::[theirstack] credit cap reached — fetch truncated at ${jobs.length} jobs ` +
        `(remaining budget this period was ${maxCredits}). Some matching jobs were not fetched.`,
    );
  }
  const uniqueCompanies = new Set(jobs.map((j) => j.company)).size;
  console.log(
    `[theirstack] total this run: ${jobs.length} jobs (≈${jobs.length} credits) from ` +
      `${uniqueCompanies} companies. (jobs/search bills API credits only — no company credits.)`,
  );
  return jobs;
}
