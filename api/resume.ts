import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_auth.js';
import {
  approveCapture,
  getResume,
  getResumePdf,
  upsertResume,
  type ResumeRow,
} from '../src/repositories/resumeRepository.js';
import { decodeAndValidatePdf } from '../src/services/resumePdf.js';
import { renderResumeHtml } from '../src/services/resumeRender.js';
import { MAX_CAPTURE_PAGES } from '../src/constants/resume.js';

/**
 * GET  /api/resume        -> { resume: meta | null } (meta includes server-rendered preview html)
 * GET  /api/resume?pdf=1  -> the original PDF bytes (for client-side page re-rendering)
 * PUT  /api/resume        -> upload/replace { filename, dataBase64, pageCount, pageSize }
 * PATCH /api/resume       -> { approved: true } marks the capture as user-approved
 */

/** Serialize the row for the client; renders the preview HTML when a capture exists. */
export function toClientResume(row: ResumeRow) {
  const captured = row.content !== null && row.css !== null;
  return {
    filename: row.filename,
    pageCount: row.pageCount,
    pageSize: row.pageSize,
    uploadedAt: row.uploadedAt,
    capturedAt: row.capturedAt,
    approvedAt: row.approvedAt,
    captureMessages: row.captureMessages,
    html: captured ? renderResumeHtml(row.content!, row.css!, row.fontLinks, row.pageSize) : null,
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
        | {
            filename?: string;
            dataBase64?: string;
            pageCount?: number;
            pageSize?: { widthPt: number; heightPt: number };
          }
        | undefined;
      if (!body?.filename || !body.dataBase64 || !body.pageCount || !body.pageSize) {
        res
          .status(400)
          .json({ error: 'filename, dataBase64, pageCount and pageSize are required' });
        return;
      }
      if (!/\.pdf$/i.test(body.filename)) {
        res.status(400).json({ error: 'Only PDF resumes are supported' });
        return;
      }
      if (body.pageCount > MAX_CAPTURE_PAGES) {
        res.status(400).json({
          error: `Resume has ${body.pageCount} pages — max supported is ${MAX_CAPTURE_PAGES}`,
        });
        return;
      }
      let data: Buffer;
      try {
        data = decodeAndValidatePdf(body.dataBase64);
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
        return;
      }
      await upsertResume(body.filename, data, body.pageCount, body.pageSize);
      const row = await getResume();
      res.status(200).json({ resume: row ? toClientResume(row) : null });
      return;
    }

    if (req.method === 'PATCH') {
      const body = req.body as { approved?: boolean } | undefined;
      if (body?.approved !== true) {
        res.status(400).json({ error: 'Expected { approved: true }' });
        return;
      }
      await approveCapture();
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
