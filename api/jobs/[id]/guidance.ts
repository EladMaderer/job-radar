import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../_auth.js';
import { getJobById } from '../../../src/repositories/jobsRepository.js';
import { getResume } from '../../../src/repositories/resumeRepository.js';
import { getGuidance, upsertGuidance } from '../../../src/repositories/guidanceRepository.js';
import { createResumeGuidance } from '../../../src/services/resumeGuidance.js';

/**
 * GET  /api/jobs/:id/guidance — stored resume guidance (markdown), or null.
 * POST /api/jobs/:id/guidance — generate/regenerate: what to emphasize in the resume for this role.
 * LLM call — maxDuration raised in vercel.json.
 */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireAuth(req, res)) return;

  const id = Number(first(req.query.id));
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid job id' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const g = await getGuidance(id);
      res.status(200).json({ guidance: g ? { content: g.content, createdAt: g.createdAt } : null });
      return;
    }

    if (req.method === 'POST') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
        return;
      }
      const job = await getJobById(id);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }
      if (!job.description) {
        res.status(409).json({ error: 'No description stored for this job — cannot analyze it' });
        return;
      }
      const resume = await getResume();
      const guidance = createResumeGuidance(apiKey);
      const content = await guidance.generate({
        jobDescription: job.description,
        company: job.company,
        title: job.title,
        resumeText: resume?.resumeText ?? null,
        context: resume?.context ?? null,
      });
      await upsertGuidance(id, job.company, job.title, content);
      const saved = await getGuidance(id);
      res.status(200).json({
        guidance: saved ? { content: saved.content, createdAt: saved.createdAt } : null,
      });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[api/jobs/:id/guidance] error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
