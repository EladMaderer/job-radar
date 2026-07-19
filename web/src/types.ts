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
  statusNote: string | null; // short user note on the status (e.g. why rejected)
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface JobsResponse {
  jobs: JobListItem[];
  total: number;
}

export type JobStatus =
  'new' | 'interested' | 'applied' | 'rejected' | 'interview' | 'not_interested' | 'halted';

export const STATUSES: JobStatus[] = [
  'new',
  'interested',
  'applied',
  'rejected',
  'interview',
  'not_interested',
  'halted', // no longer accepting applications — set automatically, overridable by hand
];

/** Max length of the free-text status note — mirrors STATUS_NOTE_MAX_LENGTH on the server. */
export const STATUS_NOTE_MAX_LENGTH = 30;

/** Friendly label for a status value (e.g. 'not_interested' -> 'not interested'). */
export function statusLabel(status: JobStatus): string {
  return status.replace(/_/g, ' ');
}

export type SortKey = 'score' | 'posted' | 'company' | 'title' | 'status';
export type SortOrder = 'asc' | 'desc';

// --- Resume / guidance feature ---

export interface JobDetail extends JobListItem {
  description: string | null;
}

export interface ResumeMeta {
  filename: string;
  uploadedAt: string;
  context: string | null; // private real-experience notes; guides guidance/prep, never shown
  hasText: boolean; // whether the extracted resume text is stored
}

export interface GuidanceState {
  content: string; // markdown: what to emphasize in the resume for this role
  createdAt: string;
}

export interface PrepState {
  content: string;
  createdAt: string;
}
