/** Mirrors the API's JobListItem shape (dates arrive as ISO strings over JSON). */
export interface JobListItem {
  id: number;
  source: string;
  company: string;
  title: string;
  location: string | null;
  url: string;
  fitScore: number | null;
  why: string | null;
  status: JobStatus;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface JobsResponse {
  jobs: JobListItem[];
  total: number;
}

export type JobStatus = 'new' | 'interested' | 'applied' | 'rejected' | 'interview';

export const STATUSES: JobStatus[] = ['new', 'interested', 'applied', 'rejected', 'interview'];

export type SortKey = 'score' | 'firstSeen' | 'posted' | 'company' | 'title' | 'status';
export type SortOrder = 'asc' | 'desc';
