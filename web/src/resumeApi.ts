import { authFetch } from './auth.js';
import type { ResumeMeta } from './types.js';

async function readResume(res: Response): Promise<ResumeMeta | null> {
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(msg.error ?? `Request failed: HTTP ${res.status}`);
  }
  return ((await res.json()) as { resume: ResumeMeta | null }).resume;
}

export async function fetchResume(): Promise<ResumeMeta | null> {
  return readResume(await authFetch('/api/resume'));
}

export async function fetchResumePdfBytes(): Promise<ArrayBuffer> {
  const res = await authFetch('/api/resume?pdf=1');
  if (!res.ok) throw new Error(`Failed to load resume PDF: HTTP ${res.status}`);
  return res.arrayBuffer();
}

export async function uploadResume(body: {
  filename: string;
  dataBase64: string;
  pageCount: number;
  pageSize: { widthPt: number; heightPt: number };
}): Promise<ResumeMeta | null> {
  return readResume(
    await authFetch('/api/resume', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

export async function captureResume(
  pages: { imageBase64: string }[],
  text: string,
  message?: string,
): Promise<ResumeMeta | null> {
  return readResume(
    await authFetch('/api/resume/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pages, text, message }),
    }),
  );
}

export async function approveResume(): Promise<ResumeMeta | null> {
  return readResume(
    await authFetch('/api/resume', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approved: true }),
    }),
  );
}
