import { fetchText } from '../constants/http.js';
import type { AtsAdapter, Job } from './types.js';

export const COMEET_SOURCE = 'comeet';

/**
 * Comeet has no clean public JSON API (its positions endpoint needs a per-company server-side
 * token). But the public Comeet-hosted careers page embeds the full positions list as a
 * `COMPANY_POSITIONS_DATA = [ ... ];` JavaScript array — no token required. We fetch that page and
 * parse the array. The registry slug is `company/uid` (e.g. `cyera/17.008`), taken from the
 * company's `comeet.com/jobs/{company}/{uid}` links.
 */

interface ComeetPosition {
  uid: string;
  name: string;
  department?: string;
  employment_type?: string;
  experience_level?: string;
  workplace_type?: string; // 'Remote' | 'Hybrid' | 'On-site'
  time_updated?: string; // ISO
  url_comeet_hosted_page?: string;
  url_active_page?: string;
  location?: { name?: string; country?: string } | null;
}

const POSITIONS_RE = /COMPANY_POSITIONS_DATA\s*=\s*(\[[\s\S]*?\]);/;

/**
 * Comeet's list payload carries no free-text description, only structured fields. Synthesize a
 * short one so the scorer has signal beyond the title.
 */
function synthesizeDescription(raw: ComeetPosition): string | null {
  const parts = [raw.department, raw.experience_level, raw.employment_type, raw.workplace_type]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Comeet careers adapter — parses the embedded positions array from the hosted careers page. */
export const comeetAdapter: AtsAdapter = async (slug, companyName) => {
  const html = await fetchText(`https://www.comeet.com/jobs/${slug}`);
  const match = POSITIONS_RE.exec(html);
  if (!match) {
    throw new Error(`Comeet ${slug}: COMPANY_POSITIONS_DATA not found on page`);
  }

  const positions = JSON.parse(match[1]!) as ComeetPosition[];

  return positions.map((raw): Job => {
    const workplace = raw.workplace_type?.toLowerCase() ?? '';
    return {
      source: COMEET_SOURCE,
      externalId: raw.uid,
      company: companyName,
      title: raw.name.trim(),
      location: raw.location?.name?.trim() || null,
      url:
        raw.url_comeet_hosted_page || raw.url_active_page || `https://www.comeet.com/jobs/${slug}`,
      description: synthesizeDescription(raw),
      postedAt: raw.time_updated ? new Date(raw.time_updated) : null,
      remote: workplace.includes('remote'),
      countryCode: raw.location?.country?.trim() || null,
    };
  });
};
