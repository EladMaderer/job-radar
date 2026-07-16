import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_auth.js';
import {
  listJobs,
  SORT_COLUMNS,
  type JobStatus,
  type ListJobsFilters,
  type SortKey,
} from '../src/repositories/jobsRepository.js';

const VALID_STATUSES: JobStatus[] = ['new', 'interested', 'applied', 'rejected', 'interview'];
const VALID_SORTS = Object.keys(SORT_COLUMNS) as SortKey[];

/** First value of a query param (Vercel gives string | string[]). */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseFilters(query: VercelRequest['query']): ListJobsFilters {
  const filters: ListJobsFilters = {};

  const status = first(query.status);
  if (status && (VALID_STATUSES as string[]).includes(status)) {
    filters.status = status as JobStatus;
  }

  const minScore = first(query.minScore);
  if (minScore !== undefined && minScore !== '' && !Number.isNaN(Number(minScore))) {
    filters.minScore = Number(minScore);
  }

  const search = first(query.search);
  if (search) filters.search = search;

  const sort = first(query.sort);
  if (sort && (VALID_SORTS as string[]).includes(sort)) filters.sort = sort as SortKey;

  const order = first(query.order);
  if (order === 'asc' || order === 'desc') filters.order = order;

  const limit = first(query.limit);
  if (limit !== undefined && !Number.isNaN(Number(limit))) filters.limit = Number(limit);

  const offset = first(query.offset);
  if (offset !== undefined && !Number.isNaN(Number(offset))) filters.offset = Number(offset);

  return filters;
}

/** GET /api/jobs — list jobs for the dashboard, with optional status/minScore/search/paging. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireAuth(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const result = await listJobs(parseFilters(req.query));
    res.status(200).json(result);
  } catch (err) {
    console.error('[api/jobs] error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
