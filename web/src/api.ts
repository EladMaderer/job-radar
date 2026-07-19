import { authFetch } from './auth.js';
import type { JobListItem, JobsResponse, JobStatus, SortKey, SortOrder } from './types.js';

export interface JobQuery {
  status?: JobStatus | '';
  minScore?: number;
  search?: string;
  maxAgeDays?: number;
  sort?: SortKey;
  order?: SortOrder;
  limit?: number;
  offset?: number;
}

/** GET /api/jobs with the current filters/sort as query params. */
export async function fetchJobs(query: JobQuery): Promise<JobsResponse> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (typeof query.minScore === 'number' && query.minScore > 0) {
    params.set('minScore', String(query.minScore));
  }
  if (query.search && query.search.trim()) params.set('search', query.search.trim());
  if (query.maxAgeDays && query.maxAgeDays > 0) params.set('maxAgeDays', String(query.maxAgeDays));
  if (query.sort) params.set('sort', query.sort);
  if (query.order) params.set('order', query.order);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.offset) params.set('offset', String(query.offset));

  const res = await authFetch(`/api/jobs?${params.toString()}`);
  if (!res.ok) throw new Error(`Request failed: HTTP ${res.status}`);
  return (await res.json()) as JobsResponse;
}

/** PATCH /api/jobs/:id — set a job's short status note ('' clears it). Returns the updated job. */
export async function updateJobStatusNote(id: number, statusNote: string): Promise<JobListItem> {
  const res = await authFetch(`/api/jobs/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ statusNote: statusNote.trim() || null }),
  });
  if (!res.ok) throw new Error(`Update failed: HTTP ${res.status}`);
  return ((await res.json()) as { job: JobListItem }).job;
}

/** PATCH /api/jobs/:id — change a job's status. Returns the updated job. */
export async function updateJobStatus(id: number, status: JobStatus): Promise<JobListItem> {
  const res = await authFetch(`/api/jobs/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Update failed: HTTP ${res.status}`);
  return ((await res.json()) as { job: JobListItem }).job;
}
