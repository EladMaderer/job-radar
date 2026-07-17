import { authFetch } from './auth.js';
import type { JobDetail, PrepState, TailorState } from './types.js';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(msg.error ?? `Request failed: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchJob(id: number): Promise<JobDetail> {
  return (await json<{ job: JobDetail }>(await authFetch(`/api/jobs/${id}`))).job;
}

export async function fetchTailor(id: number): Promise<TailorState | null> {
  const res = await authFetch(`/api/jobs/${id}/tailor`);
  // 409 (design not captured) still carries { tailor: null } — surface message elsewhere.
  if (res.status === 409) return null;
  return (await json<{ tailor: TailorState | null }>(res)).tailor;
}

export async function postTailor(id: number, message?: string): Promise<TailorState | null> {
  const res = await authFetch(`/api/jobs/${id}/tailor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message ? { message } : {}),
  });
  return (await json<{ tailor: TailorState | null }>(res)).tailor;
}

export async function resetTailor(id: number): Promise<void> {
  await authFetch(`/api/jobs/${id}/tailor`, { method: 'DELETE' });
}

/** Download the tailored PDF via the Bearer-authed endpoint (a bare <a> can't send the header). */
export async function downloadTailorPdf(id: number): Promise<void> {
  const res = await authFetch(`/api/jobs/${id}/tailor/pdf`);
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(msg.error ?? `Download failed: HTTP ${res.status}`);
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? 'resume.pdf';
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fetchPrep(id: number): Promise<PrepState | null> {
  return (await json<{ prep: PrepState | null }>(await authFetch(`/api/jobs/${id}/prep`))).prep;
}

export async function postPrep(id: number): Promise<PrepState | null> {
  return (
    await json<{ prep: PrepState | null }>(
      await authFetch(`/api/jobs/${id}/prep`, { method: 'POST' }),
    )
  ).prep;
}
