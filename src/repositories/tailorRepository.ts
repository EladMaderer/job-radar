import { pool } from '../db/pool.js';
import type { ChatMsg, ResumeContent } from '../services/resumeContent.js';

/**
 * Per-job tailored resumes. No FK to jobs: rows there are deleted on manual re-baselines, and
 * tailoring work must survive that — company/title/url/job_description are snapshotted here.
 */

export interface TailorChange {
  where: string;
  what: string;
}

export interface TailorRow {
  jobId: number;
  company: string;
  title: string;
  url: string;
  jobDescription: string;
  content: ResumeContent;
  changes: TailorChange[];
  note: string | null;
  messages: ChatMsg[];
  updatedAt: Date;
}

interface RawRow {
  job_id: number;
  company: string;
  title: string;
  url: string;
  job_description: string;
  content: ResumeContent;
  changes: TailorChange[];
  note: string | null;
  messages: ChatMsg[];
  updated_at: Date;
}

export async function getTailor(jobId: number): Promise<TailorRow | null> {
  const { rows } = await pool.query<RawRow>(
    `SELECT job_id, company, title, url, job_description, content, changes, note, messages, updated_at
       FROM job_tailors WHERE job_id = $1`,
    [jobId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    jobId: r.job_id,
    company: r.company,
    title: r.title,
    url: r.url,
    jobDescription: r.job_description,
    content: r.content,
    changes: r.changes,
    note: r.note,
    messages: r.messages,
    updatedAt: r.updated_at,
  };
}

export async function upsertTailor(row: Omit<TailorRow, 'updatedAt'>): Promise<void> {
  await pool.query(
    `INSERT INTO job_tailors
       (job_id, company, title, url, job_description, content, changes, note, messages)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (job_id) DO UPDATE SET
       content = EXCLUDED.content,
       changes = EXCLUDED.changes,
       note = EXCLUDED.note,
       messages = EXCLUDED.messages,
       updated_at = now()`,
    [
      row.jobId,
      row.company,
      row.title,
      row.url,
      row.jobDescription,
      JSON.stringify(row.content),
      JSON.stringify(row.changes),
      row.note,
      JSON.stringify(row.messages),
    ],
  );
}

/** Start over: drop the tailored session so the next generate begins from the base resume. */
export async function deleteTailor(jobId: number): Promise<void> {
  await pool.query('DELETE FROM job_tailors WHERE job_id = $1', [jobId]);
}
