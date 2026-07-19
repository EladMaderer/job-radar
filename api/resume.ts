import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_auth.js';
import {
  getResume,
  getResumePdf,
  saveContext,
  saveResumeText,
  upsertResume,
  type ResumeRow,
} from '../src/repositories/resumeRepository.js';
import { decodeAndValidatePdf } from '../src/services/resumePdf.js';
import { MAX_RESUME_TEXT_CHARS } from '../src/constants/resume.js';

/**
 * GET   /api/resume        -> { resume: meta | null }
 * GET   /api/resume?pdf=1  -> the original PDF bytes (viewing + client re-extraction)
 * PUT   /api/resume        -> upload/replace { filename, dataBase64, resumeText }
 * PATCH /api/resume        -> { context } saves private notes, or { resumeText } back-fills text
 */
function toClientResume(row: ResumeRow) {
  return {
    filename: row.filename,
    uploadedAt: row.uploadedAt,
    context: row.context,
    hasText: !!row.resumeText && row.resumeText.length > 0,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      if (req.query.pdf === '1') {
        const pdf = await getResumePdf();
        if (!pdf) {
          res.status(404).json({ error: 'No resume uploaded' });
          return;
        }
        res.setHeader('content-type', 'application/pdf');
        res.setHeader('content-disposition', `inline; filename="${pdf.filename}"`);
        res.end(pdf.data);
        return;
      }
      const row = await getResume();
      res.status(200).json({ resume: row ? toClientResume(row) : null });
      return;
    }

    if (req.method === 'PUT') {
      const body = req.body as
        { filename?: string; dataBase64?: string; resumeText?: string } | undefined;
      if (!body?.filename || !body.dataBase64) {
        res.status(400).json({ error: 'filename and dataBase64 are required' });
        return;
      }
      if (!/\.pdf$/i.test(body.filename)) {
        res.status(400).json({ error: 'Only PDF resumes are supported' });
        return;
      }
      let data: Buffer;
      try {
        data = decodeAndValidatePdf(body.dataBase64);
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
      await upsertResume(
        body.filename,
        data,
        (body.resumeText ?? '').slice(0, MAX_RESUME_TEXT_CHARS),
      );
      const row = await getResume();
      res.status(200).json({ resume: row ? toClientResume(row) : null });
      return;
    }

    if (req.method === 'PATCH') {
      const body = req.body as { context?: string; resumeText?: string } | undefined;
      if (typeof body?.context === 'string') {
        await saveContext(body.context);
      } else if (typeof body?.resumeText === 'string') {
        await saveResumeText(body.resumeText.slice(0, MAX_RESUME_TEXT_CHARS));
      } else {
        res.status(400).json({ error: 'Expected { context } or { resumeText }' });
        return;
      }
      const row = await getResume();
      res.status(200).json({ resume: row ? toClientResume(row) : null });
      return;
    }

    res.setHeader('Allow', 'GET, PUT, PATCH');
    res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[api/resume] error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
