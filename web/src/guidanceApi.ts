import { authFetch } from './auth.js';
import type { GuidanceState, JobDetail, PrepState } from './types.js';

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

export async function fetchGuidance(id: number): Promise<GuidanceState | null> {
  return (
    await json<{ guidance: GuidanceState | null }>(await authFetch(`/api/jobs/${id}/guidance`))
  ).guidance;
}

export async function postGuidance(id: number): Promise<GuidanceState | null> {
  return (
    await json<{ guidance: GuidanceState | null }>(
      await authFetch(`/api/jobs/${id}/guidance`, { method: 'POST' }),
    )
  ).guidance;
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
