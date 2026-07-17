import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../_auth.js';
import { getJobById } from '../../../src/repositories/jobsRepository.js';
import { getResume } from '../../../src/repositories/resumeRepository.js';
import {
  deleteTailor,
  getTailor,
  upsertTailor,
  type TailorRow,
} from '../../../src/repositories/tailorRepository.js';
import { createResumeTailor } from '../../../src/services/resumeTailor.js';
import { renderResumeHtml } from '../../../src/services/resumeRender.js';
import { MAX_TAILOR_MESSAGES } from '../../../src/constants/resume.js';
import type { ChatMsg } from '../../../src/services/resumeContent.js';
import type { ResumeRow } from '../../../src/repositories/resumeRepository.js';

/**
 * GET    /api/jobs/:id/tailor — the stored tailoring session (content, chat, preview html)
 * POST   /api/jobs/:id/tailor — { message? }: no message = initial generate, else a chat turn
 * DELETE /api/jobs/:id/tailor — start over (drop the session)
 * Long-running LLM call — maxDuration raised in vercel.json.
 */

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toClientTailor(row: TailorRow, resume: ResumeRow) {
  return {
    content: row.content,
    changes: row.changes,
    note: row.note,
    messages: row.messages,
    updatedAt: row.updatedAt,
    company: row.company,
    title: row.title,
    html: renderResumeHtml(row.content, resume.css ?? '', resume.fontLinks, resume.pageSize),
  };
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
      const row = await getTailor(id);
      if (!row) {
        res.status(200).json({ tailor: null });
        return;
      }
      const resume = await getResume();
      if (!resume?.content || !resume.css) {
        // Session exists but the design was reset (new upload) — the client shows a re-capture hint.
        res
          .status(409)
          .json({ error: 'Resume design not captured — re-capture it first', tailor: null });
        return;
      }
      res.status(200).json({ tailor: toClientTailor(row, resume) });
      return;
    }

    if (req.method === 'DELETE') {
      await deleteTailor(id);
      res.status(200).json({ tailor: null });
      return;
    }

    if (req.method === 'POST') {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
        return;
      }
      const resume = await getResume();
      if (!resume) {
        res.status(409).json({ error: 'Upload your resume PDF first (top of the page)' });
        return;
      }
      if (!resume.content || !resume.css) {
        res.status(409).json({ error: 'Capture your resume design first (open the CV page)' });
        return;
      }

      const message = (req.body as { message?: string } | undefined)?.message?.trim() || null;
      const existing = await getTailor(id);

      // The JD comes from the live job row, or the snapshot if the row was re-baselined away.
      let company: string, title: string, url: string, jobDescription: string;
      const job = await getJobById(id);
      if (job?.description) {
        ({ company, title, url } = job);
        jobDescription = job.description;
      } else if (existing) {
        ({ company, title, url, jobDescription } = existing);
      } else {
        res.status(409).json({
          error: job
            ? 'No description stored for this job — cannot tailor without the job text'
            : 'Job not found',
        });
        return;
      }

      const tailorer = createResumeTailor(apiKey);
      const result = await tailorer.tailor({
        jobDescription,
        company,
        title,
        baseContent: resume.content,
        currentContent: existing?.content ?? null,
        history: existing?.messages ?? [],
        message,
      });

      // Chat history stores summaries only; cap by dropping the oldest pair (base+JD re-sent every call).
      const now = new Date().toISOString();
      const changesDigest = result.changes.map((c) => `${c.where}: ${c.what}`).join('; ');
      let messages: ChatMsg[] = [
        ...(existing?.messages ?? []),
        { role: 'user', text: message ?? '(initial tailored version)', at: now },
        { role: 'assistant', text: `${result.note} [${changesDigest.slice(0, 300)}]`, at: now },
      ];
      while (messages.length > MAX_TAILOR_MESSAGES) messages = messages.slice(2);

      await upsertTailor({
        jobId: id,
        company,
        title,
        url,
        jobDescription,
        content: result.content,
        changes: result.changes,
        note: result.note,
        messages,
      });
      const saved = await getTailor(id);
      res.status(200).json({ tailor: saved ? toClientTailor(saved, resume) : null });
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[api/jobs/:id/tailor] error:', err);
    const msg = err instanceof Error ? err.message : 'Internal Server Error';
    const status = /truncated|Invalid resume content|JSON/.test(msg) ? 502 : 500;
    res.status(status).json({ error: msg });
  }
}
