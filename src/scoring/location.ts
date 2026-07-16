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
 * Keep a job if it is in Israel, or remote in any form (remote-anywhere / EMEA / global roles
 * are often open to Israel — kept, but they earn no location bonus). Drop only clearly-foreign
 * roles: pinned to a non-Israel city with no remote signal.
 */
export function classifyLocation(job: Job): LocationClassification {
  const text = (job.location ?? '').toLowerCase();
  const inCommuteZone = contains(text, COMMUTE_ZONE);
  const inIsrael = contains(text, ISRAEL_CITIES) || isIsraeliCountry(job.countryCode);
  const isRemote = job.remote || contains(text, REMOTE_HINTS);

  // No location text at all: keep it (better to review than silently drop) but treat as unknown.
  const hasLocationText = text.trim().length > 0;
  const keep = inIsrael || isRemote || !hasLocationText;

  return { inCommuteZone, inIsrael, isRemote, keep };
}

/** Israel signal from a Lever ISO country code, independent of the location string. */
export function isIsraeliCountry(countryCode: string | null | undefined): boolean {
  return countryCode != null && ISRAEL_COUNTRY_CODES.includes(countryCode.toLowerCase());
}
