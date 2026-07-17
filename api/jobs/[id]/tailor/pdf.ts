import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../../_auth.js';
import { getResume } from '../../../../src/repositories/resumeRepository.js';
import { getTailor } from '../../../../src/repositories/tailorRepository.js';
import { renderResumeHtml } from '../../../../src/services/resumeRender.js';
import { renderPdf } from '../../../../src/services/resumePdfRender.js';
import { tailoredPdfFilename } from '../../../../src/services/resumePdf.js';

/**
 * GET /api/jobs/:id/tailor/pdf — render the tailored resume to a real text-based PDF and download.
 * The ONLY function that bundles @sparticuz/chromium (via resumePdfRender) — keep it that way.
 */

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireAuth(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const id = Number(first(req.query.id));
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid job id' });
    return;
  }

  try {
    const tailor = await getTailor(id);
    if (!tailor) {
      res.status(404).json({ error: 'No tailored resume for this job yet' });
      return;
    }
    const resume = await getResume();
    if (!resume?.css) {
      res.status(409).json({ error: 'Resume design not captured — re-capture it first' });
      return;
    }

    const html = renderResumeHtml(tailor.content, resume.css, resume.fontLinks, resume.pageSize);
    const pdf = await renderPdf(html);
    const filename = tailoredPdfFilename(resume.filename, tailor.company);

    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="${filename}"`);
    res.end(pdf);
  } catch (err) {
    console.error('[api/jobs/:id/tailor/pdf] error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal Server Error' });
  }
}
