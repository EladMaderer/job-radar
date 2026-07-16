import { greenhouseAdapter, GREENHOUSE_SOURCE } from '../ats/greenhouse.js';
import { leverAdapter, LEVER_SOURCE } from '../ats/lever.js';
import type { AtsAdapter } from '../ats/types.js';

export type AtsName = 'greenhouse' | 'lever';

export interface Company {
  name: string; // display name used on stored jobs + alerts
  ats: AtsName;
  slug: string; // board identifier on that ATS
}

/**
 * The boards we poll. Adding a company is a one-line entry here.
 * All six verified as live (returning jobs) at build time.
 */
export const COMPANIES: Company[] = [
  { name: 'Similarweb', ats: 'greenhouse', slug: 'similarweb' },
  { name: 'JFrog', ats: 'greenhouse', slug: 'jfrog' },
  { name: 'Forter', ats: 'greenhouse', slug: 'forter' },
  { name: 'Pagaya', ats: 'greenhouse', slug: 'pagayais' },
  { name: 'DoubleVerify', ats: 'greenhouse', slug: 'doubleverify' },
  { name: 'Cloudinary', ats: 'lever', slug: 'cloudinary' },
];

const ADAPTERS: Record<AtsName, AtsAdapter> = {
  [GREENHOUSE_SOURCE]: greenhouseAdapter,
  [LEVER_SOURCE]: leverAdapter,
};

export function adapterFor(company: Company): AtsAdapter {
  return ADAPTERS[company.ats];
}
