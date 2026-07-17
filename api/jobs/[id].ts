import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_auth.js';
import {
  getJobById,
  JOB_STATUSES,
  updateStatus,
  type JobStatus,
} from '../../src/repositories/jobsRepository.js';

const VALID_STATUSES = JOB_STATUSES as readonly JobStatus[];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * GET   /api/jobs/:id — job detail incl. description (the detail page + AI features need it).
 * PATCH /api/jobs/:id — update a job's status. Body: { status }.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireAuth(req, res)) return;

  const id = Number(first(req.query.id));
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid job id' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const job = await getJobById(id);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      res.status(200).json({ job });
      return;
    }

    if (req.method === 'PATCH') {
      const body = (req.body ?? {}) as { status?: unknown };
      const status = body.status;
      if (typeof status !== 'string' || !(VALID_STATUSES as readonly string[]).includes(status)) {
        res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
        return;
      }
      const job = await updateStatus(id, status as JobStatus);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      res.status(200).json({ job });
      return;
    }

    res.setHeader('Allow', 'GET, PATCH');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[api/jobs/:id] error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
