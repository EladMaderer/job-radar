import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';

// Files under /api whose name starts with "_" are not routed by Vercel — this is a shared lib.

/** Constant-time string compare, so a wrong password can't be guessed by timing the response. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Gate an API request behind the shared dashboard password (Authorization: Bearer <password>).
 * Returns true if allowed; otherwise writes the error response and returns false, so callers do:
 *   if (!requireAuth(req, res)) return;
 */
export function requireAuth(req: VercelRequest, res: VercelResponse): boolean {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    console.error('[auth] DASHBOARD_PASSWORD is not set — refusing all requests');
    res.status(500).json({ error: 'Server auth not configured' });
    return false;
  }

  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token || !safeEqual(token, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}
