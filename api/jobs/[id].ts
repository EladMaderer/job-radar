import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_auth.js';
import { updateStatus, type JobStatus } from '../../src/repositories/jobsRepository.js';

const VALID_STATUSES: JobStatus[] = ['new', 'interested', 'applied', 'rejected', 'interview'];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** PATCH /api/jobs/:id — update a job's status. Body: { status }. */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireAuth(req, res)) return;

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const id = Number(first(req.query.id));
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid job id' });
    return;
  }

  const body = (req.body ?? {}) as { status?: unknown };
  const status = body.status;
  if (typeof status !== 'string' || !(VALID_STATUSES as string[]).includes(status)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    return;
  }

  try {
    const job = await updateStatus(id, status as JobStatus);
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    res.status(200).json({ job });
  } catch (err) {
    console.error('[api/jobs/:id] error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
