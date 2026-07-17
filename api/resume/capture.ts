import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_auth.js';
import { getResume, saveCapture } from '../../src/repositories/resumeRepository.js';
import { createResumeCapturer } from '../../src/services/resumeCapture.js';
import { MAX_CAPTURE_PAGES } from '../../src/constants/resume.js';
import { toClientResume } from '../resume.js';
import type { ChatMsg } from '../../src/services/resumeContent.js';

/**
 * POST /api/resume/capture
 * body { pages: [{imageBase64}], text?: string, message?: string }
 * - no `message`  => initial design capture (images + extracted text -> content + css)
 * - with `message` => refine the captured design per the user's request
 * Long-running LLM call — maxDuration raised in vercel.json.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!requireAuth(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on the server' });
    return;
  }

  try {
    const body = req.body as
      { pages?: { imageBase64?: string }[]; text?: string; message?: string } | undefined;
    const pages = (body?.pages ?? []).filter(
      (p): p is { imageBase64: string } =>
        typeof p.imageBase64 === 'string' && p.imageBase64.length > 0,
    );
    if (pages.length === 0) {
      res.status(400).json({ error: 'pages[] with imageBase64 is required' });
      return;
    }
    if (pages.length > MAX_CAPTURE_PAGES) {
      res.status(400).json({ error: `Max ${MAX_CAPTURE_PAGES} pages supported` });
      return;
    }

    const row = await getResume();
    if (!row) {
      res.status(409).json({ error: 'Upload a resume PDF first' });
      return;
    }

    const capturer = createResumeCapturer(apiKey);
    const now = new Date().toISOString();

    if (body?.message) {
      // Refine an existing capture.
      if (!row.content || !row.css) {
        res.status(409).json({ error: 'No capture to refine — run the initial capture first' });
        return;
      }
      const result = await capturer.refine(
        pages,
        { content: row.content, css: row.css, fontLinks: row.fontLinks },
        row.captureMessages,
        body.message,
      );
      const messages: ChatMsg[] = [
        ...row.captureMessages,
        { role: 'user', text: body.message, at: now },
        { role: 'assistant', text: 'Updated the design.', at: now },
      ];
      await saveCapture(result.content, result.css, result.fontLinks, messages);
    } else {
      // Initial capture. Resets any prior design chat (fresh capture = fresh conversation).
      const result = await capturer.capture(pages, body?.text ?? '');
      await saveCapture(result.content, result.css, result.fontLinks, []);
    }

    const updated = await getResume();
    res.status(200).json({ resume: updated ? toClientResume(updated) : null });
  } catch (err) {
    console.error('[api/resume/capture] error:', err);
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    // Truncation/parse issues surface as 502 (retryable), everything else 500.
    const status = /truncated|Invalid resume content|JSON/.test(message) ? 502 : 500;
    res.status(status).json({ error: message });
  }
}
