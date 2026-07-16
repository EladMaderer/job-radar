import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comeetAdapter, COMEET_SOURCE } from '../ats/comeet.js';
import { greenhouseAdapter, GREENHOUSE_SOURCE } from '../ats/greenhouse.js';
import { leverAdapter, LEVER_SOURCE } from '../ats/lever.js';
import type { AtsAdapter } from '../ats/types.js';

export type AtsName = 'greenhouse' | 'lever' | 'comeet';

export interface Company {
  name: string; // display name used on stored jobs + alerts
  ats: AtsName;
  slug: string; // board identifier on that ATS
}

/**
 * Hand-curated companies. Adding one is a one-line entry here. Comeet companies live ONLY here
 * (auto-discovery can't find them). Curated entries win over discovered ones on (ats, slug) —
 * they have nicer display names.
 */
const CURATED_COMPANIES: Company[] = [
  // Original seed
  { name: 'Similarweb', ats: 'greenhouse', slug: 'similarweb' },
  { name: 'JFrog', ats: 'greenhouse', slug: 'jfrog' },
  { name: 'Forter', ats: 'greenhouse', slug: 'forter' },
  { name: 'Pagaya', ats: 'greenhouse', slug: 'pagayais' },
  { name: 'DoubleVerify', ats: 'greenhouse', slug: 'doubleverify' },
  { name: 'Cloudinary', ats: 'lever', slug: 'cloudinary' },
  // Israeli tech companies — verified to have live boards with Israel-based roles.
  { name: 'Cato Networks', ats: 'greenhouse', slug: 'catonetworks' },
  { name: 'Taboola', ats: 'greenhouse', slug: 'taboola' },
  { name: 'AppsFlyer', ats: 'greenhouse', slug: 'appsflyer' },
  { name: 'Payoneer', ats: 'greenhouse', slug: 'payoneer' },
  { name: 'Gong', ats: 'greenhouse', slug: 'gongio' },
  { name: 'Transmit Security', ats: 'greenhouse', slug: 'transmitsecurity' },
  { name: 'Fireblocks', ats: 'greenhouse', slug: 'fireblocks' },
  { name: 'Melio', ats: 'greenhouse', slug: 'melio' },
  { name: 'Axonius', ats: 'greenhouse', slug: 'axonius' },
  { name: 'Riskified', ats: 'greenhouse', slug: 'riskified' },
  { name: 'Augury', ats: 'greenhouse', slug: 'augury' },
  { name: 'Yotpo', ats: 'greenhouse', slug: 'yotpo' },
  { name: 'Lightricks', ats: 'greenhouse', slug: 'lightricks' },
  { name: 'Orca Security', ats: 'greenhouse', slug: 'orcasecurity' },
  { name: 'Descope', ats: 'greenhouse', slug: 'descope' },
  { name: 'Apiiro', ats: 'greenhouse', slug: 'apiiro' },
  { name: 'Torq', ats: 'greenhouse', slug: 'torq' },
  { name: 'Salt Security', ats: 'greenhouse', slug: 'saltsecurity' },
  { name: 'Sisense', ats: 'greenhouse', slug: 'sisense' },
  { name: 'Connecteam', ats: 'greenhouse', slug: 'connecteam' },
  { name: 'Guardz', ats: 'greenhouse', slug: 'guardz' },
  { name: 'Datadog', ats: 'greenhouse', slug: 'datadog' },
  { name: 'NICE', ats: 'greenhouse', slug: 'nice' },
  { name: 'Via', ats: 'greenhouse', slug: 'via' },
  { name: 'MyHeritage', ats: 'greenhouse', slug: 'myheritage' },
  { name: 'SafeBreach', ats: 'greenhouse', slug: 'safebreach' },
  { name: 'Optimove', ats: 'greenhouse', slug: 'optimove' },
  { name: 'Tomorrow.io', ats: 'greenhouse', slug: 'tomorrow' },
  { name: 'Electreon', ats: 'greenhouse', slug: 'electreon' },
  { name: 'WalkMe', ats: 'lever', slug: 'walkme' },
  { name: 'BioCatch', ats: 'lever', slug: 'biocatch' },
  // Comeet — slug is `company/uid` from the company's comeet.com/jobs/{company}/{uid} links.
  { name: 'Cyera', ats: 'comeet', slug: 'cyera/17.008' },
  { name: 'Guardio', ats: 'comeet', slug: 'guardio/57.000' },
  { name: 'Immunai', ats: 'comeet', slug: 'immunai/37.009' },
];

/** Auto-discovered Greenhouse/Lever boards (written by `npm run discover`). Absent on first run. */
function loadDiscovered(): Company[] {
  try {
    const path = join(dirname(fileURLToPath(import.meta.url)), 'discovered.json');
    return JSON.parse(readFileSync(path, 'utf8')) as Company[];
  } catch {
    return []; // no discovered.json yet — poll the curated list only
  }
}

/** Merge curated + discovered, deduped by (ats, slug); curated wins (better display names). */
function mergeCompanies(curated: Company[], discovered: Company[]): Company[] {
  const seen = new Set(curated.map((c) => `${c.ats}:${c.slug}`));
  const merged = [...curated];
  for (const d of discovered) {
    const key = `${d.ats}:${d.slug}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(d);
    }
  }
  return merged;
}

/** The full set of boards the poller fetches: curated companies + auto-discovered boards. */
export const COMPANIES: Company[] = mergeCompanies(CURATED_COMPANIES, loadDiscovered());

const ADAPTERS: Record<AtsName, AtsAdapter> = {
  [GREENHOUSE_SOURCE]: greenhouseAdapter,
  [LEVER_SOURCE]: leverAdapter,
  [COMEET_SOURCE]: comeetAdapter,
};

export function adapterFor(company: Company): AtsAdapter {
  return ADAPTERS[company.ats];
}
