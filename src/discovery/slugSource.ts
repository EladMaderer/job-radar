import { fetchJson } from '../constants/http.js';

/**
 * Source of ATS board slugs to probe. We reuse a public, actively-maintained harvest of ATS
 * company slugs (built from Common Crawl) rather than maintaining our own crawler — ~8k Greenhouse
 * + ~4k Lever tokens. If the source is unavailable a run simply finds nothing new; the committed
 * registry keeps working.
 */
const BASE = 'https://raw.githubusercontent.com/Feashliaa/job-board-aggregator/main/data';

export async function greenhouseSlugs(): Promise<string[]> {
  return fetchJson<string[]>(`${BASE}/greenhouse_companies.json`);
}

export async function leverSlugs(): Promise<string[]> {
  return fetchJson<string[]>(`${BASE}/lever_companies.json`);
}
