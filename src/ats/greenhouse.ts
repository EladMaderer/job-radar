import { fetchJson } from '../constants/http.js';
import { htmlToText } from './html.js';
import type { AtsAdapter, Job } from './types.js';

export const GREENHOUSE_SOURCE = 'greenhouse';

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string } | null;
  content?: string | null; // entity-encoded HTML (present only with ?content=true)
  first_published?: string | null;
  updated_at?: string | null;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

function isRemote(location: string | null): boolean {
  return location != null && /\bremote\b/i.test(location);
}

/** Greenhouse board API. `?content=true` is required or `content` (the description) is absent. */
export const greenhouseAdapter: AtsAdapter = async (slug, companyName) => {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
  const data = await fetchJson<GreenhouseResponse>(url);

  return data.jobs.map((raw): Job => {
    const location = raw.location?.name?.trim() || null;
    return {
      source: GREENHOUSE_SOURCE,
      externalId: String(raw.id),
      company: companyName,
      title: raw.title.trim(),
      location,
      url: raw.absolute_url,
      description: htmlToText(raw.content),
      postedAt: raw.first_published ? new Date(raw.first_published) : null,
      remote: isRemote(location),
    };
  });
};
