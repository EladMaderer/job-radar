import { pool } from '../db/pool.js';

/**
 * Single-row resume store (id=1): the original PDF, its extracted text (so the AI knows the
 * resume content), and private real-experience context. No design capture — per-job guidance
 * works off resume_text + context.
 */

export interface ResumeRow {
  filename: string;
  resumeText: string | null;
  context: string | null;
  uploadedAt: Date;
}

export async function getResume(): Promise<ResumeRow | null> {
  const { rows } = await pool.query<{
    filename: string;
    resume_text: string | null;
    context: string | null;
    uploaded_at: Date;
  }>('SELECT filename, resume_text, context, uploaded_at FROM resume WHERE id = 1');
  const r = rows[0];
  if (!r) return null;
  return {
    filename: r.filename,
    resumeText: r.resume_text,
    context: r.context,
    uploadedAt: r.uploaded_at,
  };
}

export async function getResumePdf(): Promise<{ filename: string; data: Buffer } | null> {
  const { rows } = await pool.query<{ filename: string; data: Buffer }>(
    'SELECT filename, data FROM resume WHERE id = 1',
  );
  return rows[0] ?? null;
}

/** Replace the stored resume (file + extracted text). Private context is PRESERVED across
 * re-uploads — it describes the candidate, not the file. */
export async function upsertResume(
  filename: string,
  data: Buffer,
  resumeText: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO resume (id, filename, data, resume_text)
     VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET
       filename = EXCLUDED.filename,
       data = EXCLUDED.data,
       resume_text = EXCLUDED.resume_text,
       uploaded_at = now()`,
    [filename, data, resumeText],
  );
}

/** Back-fill the extracted text for an already-uploaded resume (client re-extracts on visit). */
export async function saveResumeText(resumeText: string): Promise<void> {
  await pool.query('UPDATE resume SET resume_text = $1 WHERE id = 1', [resumeText]);
}

export async function saveContext(context: string): Promise<void> {
  await pool.query('UPDATE resume SET context = $1 WHERE id = 1', [context]);
}
