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

export type JobStatus =
  'new' | 'interested' | 'applied' | 'rejected' | 'interview' | 'not_interested';

export const STATUSES: JobStatus[] = [
  'new',
  'interested',
  'applied',
  'rejected',
  'interview',
  'not_interested',
];

/** Friendly label for a status value (e.g. 'not_interested' -> 'not interested'). */
export function statusLabel(status: JobStatus): string {
  return status.replace(/_/g, ' ');
}

export type SortKey = 'score' | 'firstSeen' | 'posted' | 'company' | 'title' | 'status';
export type SortOrder = 'asc' | 'desc';

// --- Resume / tailoring feature ---

export interface JobDetail extends JobListItem {
  description: string | null;
}

export interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

export interface ResumeMeta {
  filename: string;
  pageCount: number;
  pageSize: { widthPt: number; heightPt: number };
  uploadedAt: string;
  capturedAt: string | null;
  approvedAt: string | null;
  captureMessages: ChatMsg[];
  html: string | null; // server-rendered preview; null until captured
}

export interface TailorChange {
  where: string;
  what: string;
}

export interface TailorState {
  content: unknown;
  changes: TailorChange[];
  note: string | null;
  messages: ChatMsg[];
  updatedAt: string;
  company: string;
  title: string;
  html: string;
}

export interface PrepState {
  content: string;
  createdAt: string;
}
