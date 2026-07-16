/** A job normalized into our common shape, regardless of which ATS it came from. */
export interface Job {
  source: string; // 'greenhouse' | 'lever'
  externalId: string; // stable id within that source
  company: string;
  title: string;
  location: string | null;
  url: string; // apply link
  description: string | null; // plain text
  postedAt: Date | null;
  /**
   * True when the ATS marks the role as remote (Lever workplaceType, or a location that
   * reads as remote). Lets the location filter/scorer treat "Remote" correctly even when
   * the location string has no city.
   */
  remote: boolean;
  /** ISO country code when the ATS provides one (Lever `country`, e.g. 'IL'); null otherwise. */
  countryCode: string | null;
}

/** Fetches and normalizes all open jobs for one company on one ATS. */
export type AtsAdapter = (slug: string, companyName: string) => Promise<Job[]>;
