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
  status: 'new' | 'interested' | 'applied' | 'rejected' | 'interview';
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface JobsResponse {
  jobs: JobListItem[];
  total: number;
}
