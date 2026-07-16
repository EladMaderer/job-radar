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

const PROBE_TIMEOUT_MS = 8_000;

/** Single-attempt GET (no retry — 404s are the common case and should fail fast). */
async function getJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
  if (il === 0) return null;
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
  if (il === 0) return null;
  return { ats: 'lever', slug, name: prettify(slug), ilCount: il };
}
