import { pool } from '../db/pool.js';

/** Per-job resume guidance: what to emphasize in the resume for this role. No FK to jobs (re-baseline
 * deletes); snapshots what it shows. */

export interface GuidanceRow {
  jobId: number;
  company: string;
  title: string;
  content: string; // markdown
  createdAt: Date;
}

export async function getGuidance(jobId: number): Promise<GuidanceRow | null> {
  const { rows } = await pool.query<{
    job_id: number;
    company: string;
    title: string;
    content: string;
    created_at: Date;
  }>('SELECT job_id, company, title, content, created_at FROM job_guidance WHERE job_id = $1', [
    jobId,
  ]);
  const r = rows[0];
  if (!r) return null;
  return {
    jobId: r.job_id,
    company: r.company,
    title: r.title,
    content: r.content,
    createdAt: r.created_at,
  };
}

export async function upsertGuidance(
  jobId: number,
  company: string,
  title: string,
  content: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO job_guidance (job_id, company, title, content)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (job_id) DO UPDATE SET
       company = EXCLUDED.company, title = EXCLUDED.title, content = EXCLUDED.content,
       created_at = now()`,
    [jobId, company, title, content],
  );
}
