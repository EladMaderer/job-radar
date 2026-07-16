import { USER_AGENT } from '../constants/http.js';
import { classifyLocation } from '../scoring/location.js';
import type { Job } from '../ats/types.js';
import type { AtsName } from '../registry/companies.js';

/** A board found to have Israel-based roles. */
export interface DiscoveredBoard {
  name: string;
  ats: AtsName;
  slug: string;
  ilCount: number;
}

const PROBE_TIMEOUT_MS = 10_000;
const PROBE_ATTEMPTS = 3; // retry transient failures so real boards aren't silently dropped

/** Keep a board only if it has a real Israel presence, not a stray Tel Aviv role. */
const MIN_IL_ABSOLUTE = 3; // >= this many Israel roles, OR
const MIN_IL_RATIO = 0.25; // Israel roles make up >= this share of the board (catches small startups)

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * GET JSON. Retries transient failures (network errors, timeouts, 429/5xx) — a single probe over
 * ~12k boards on a flaky network would otherwise lose real boards. A 404 (no such board) is
 * definitive and returns null immediately.
 */
async function getJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: controller.signal,
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status !== 429 && res.status < 500) return null; // 404 etc. — definitive
    } catch {
      // network error / timeout — fall through to retry
    } finally {
      clearTimeout(timer);
    }
    if (attempt < PROBE_ATTEMPTS - 1) await sleep(500 * (attempt + 1));
  }
  return null;
}

/** True if the board's Israel roles clear the presence bar (absolute count or share of board). */
function hasIsraelPresence(ilCount: number, total: number): boolean {
  return ilCount >= MIN_IL_ABSOLUTE || (total > 0 && ilCount / total >= MIN_IL_RATIO);
}

/** Count how many of these minimal jobs are located in Israel (reuses the poller's exact rule). */
function countIsrael(jobs: Array<Pick<Job, 'location' | 'countryCode' | 'remote'>>): number {
  let n = 0;
  for (const j of jobs) {
    if (classifyLocation(j as Job).inIsrael) n += 1;
  }
  return n;
}

const prettify = (slug: string): string =>
  slug
    .replace(/[-_]+/g, ' ')
    .replace(/\d+$/, '')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

interface GhJob {
  location?: { name?: string } | null;
  company_name?: string;
}
interface LvJob {
  categories?: { location?: string | null } | null;
  country?: string | null;
}

export async function probeGreenhouse(slug: string): Promise<DiscoveredBoard | null> {
  const data = await getJson<{ jobs?: GhJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
  );
  const jobs = data?.jobs;
  if (!jobs || jobs.length === 0) return null;
  const il = countIsrael(
    jobs.map((j) => ({ location: j.location?.name ?? null, countryCode: null, remote: false })),
  );
  if (!hasIsraelPresence(il, jobs.length)) return null;
  return {
    ats: 'greenhouse',
    slug,
    name: jobs[0]?.company_name?.trim() || prettify(slug),
    ilCount: il,
  };
}

export async function probeLever(slug: string): Promise<DiscoveredBoard | null> {
  const jobs = await getJson<LvJob[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!jobs || jobs.length === 0) return null;
  const il = countIsrael(
    jobs.map((j) => ({
      location: j.categories?.location ?? null,
      countryCode: j.country ?? null,
      remote: false,
    })),
  );
  if (!hasIsraelPresence(il, jobs.length)) return null;
  return { ats: 'lever', slug, name: prettify(slug), ilCount: il };
}
