import type { Job } from '../ats/types.js';
import {
  COMMUTE_ZONE,
  ISRAEL_CITIES,
  ISRAEL_COUNTRY_CODES,
  REMOTE_HINTS,
} from '../constants/locations.js';

export interface LocationClassification {
  inCommuteZone: boolean; // a city in my preferred commute list
  inIsrael: boolean; // anywhere in Israel (superset of commute zone)
  isRemote: boolean; // ATS remote flag or a remote hint in the location text
  /** Keep for storage/scoring, or drop as clearly foreign. */
  keep: boolean;
}

const contains = (haystack: string, needles: readonly string[]): boolean =>
  needles.some((n) => haystack.includes(n));

/**
 * Base filter + location signal in one pass.
 *
 * Keep a job ONLY if it is in Israel (or has no location text at all — better to review than
 * silently drop an unknown). Remote-anywhere / EMEA / global roles with no Israel tie are DROPPED,
 * not just denied the location bonus — remote-only jobs are not wanted regardless of scope.
 * `isRemote` on a job that IS in Israel is still fine (and still earns the bonus elsewhere) —
 * `inIsrael` alone decides `keep`, so a real remote-in-Israel role stays, it just isn't kept
 * *because* it's remote.
 */
export function classifyLocation(job: Job): LocationClassification {
  const text = (job.location ?? '').toLowerCase();
  const inCommuteZone = contains(text, COMMUTE_ZONE);
  const inIsrael = contains(text, ISRAEL_CITIES) || isIsraeliCountry(job.countryCode);
  const isRemote = job.remote || contains(text, REMOTE_HINTS);

  // No location text at all: keep it (better to review than silently drop) but treat as unknown.
  const hasLocationText = text.trim().length > 0;
  const keep = inIsrael || !hasLocationText;

  return { inCommuteZone, inIsrael, isRemote, keep };
}

/** Israel signal from a Lever ISO country code, independent of the location string. */
export function isIsraeliCountry(countryCode: string | null | undefined): boolean {
  return countryCode != null && ISRAEL_COUNTRY_CODES.includes(countryCode.toLowerCase());
}
