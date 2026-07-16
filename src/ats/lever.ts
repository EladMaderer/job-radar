import { fetchJson } from '../constants/http.js';
import type { AtsAdapter, Job } from './types.js';

export const LEVER_SOURCE = 'lever';

interface LeverPosting {
  id: string;
  text: string; // title
  hostedUrl: string;
  createdAt?: number; // epoch ms
  descriptionPlain?: string | null;
  workplaceType?: string | null; // 'remote' | 'hybrid' | 'on-site'
  country?: string | null; // ISO code, e.g. 'IL'
  categories?: {
    location?: string | null;
    allLocations?: string[] | null;
  } | null;
}

/** Build the display location from Lever's category fields, keeping all listed locations. */
function leverLocation(posting: LeverPosting): string | null {
  const all = posting.categories?.allLocations?.filter(Boolean);
  if (all && all.length > 0) return all.join(' / ');
  return posting.categories?.location?.trim() || null;
}

/** Lever postings API in JSON mode. */
export const leverAdapter: AtsAdapter = async (slug, companyName) => {
  const url = `https://api.lever.co/v0/postings/${slug}?mode=json`;
  const postings = await fetchJson<LeverPosting[]>(url);

  return postings.map((raw): Job => {
    const location = leverLocation(raw);
    return {
      source: LEVER_SOURCE,
      externalId: raw.id,
      company: companyName,
      title: raw.text.trim(),
      location,
      url: raw.hostedUrl,
      description: raw.descriptionPlain?.trim() || null,
      postedAt: raw.createdAt ? new Date(raw.createdAt) : null,
      remote: raw.workplaceType?.toLowerCase() === 'remote',
      countryCode: raw.country?.trim() || null,
    };
  });
};
