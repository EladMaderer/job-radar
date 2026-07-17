import { pool } from '../db/pool.js';
import type { ChatMsg, ResumeContent } from '../services/resumeContent.js';
import type { PageSize } from '../services/resumeRender.js';

/**
 * The single-row resume store (id=1): original PDF bytes + the captured design. A new upload
 * replaces the file and RESETS the capture — the old design/content describe the old file.
 */

export interface ResumeRow {
  filename: string;
  pageCount: number;
  pageSize: PageSize;
  content: ResumeContent | null;
  css: string | null;
  fontLinks: string[];
  captureMessages: ChatMsg[];
  context: string | null; // private real-experience notes; guides tailoring, never shown
  uploadedAt: Date;
  capturedAt: Date | null;
  approvedAt: Date | null;
}

interface RawRow {
  filename: string;
  page_count: number;
  page_size: PageSize;
  content: ResumeContent | null;
  css: string | null;
  font_links: string[];
  capture_messages: ChatMsg[];
  context: string | null;
  uploaded_at: Date;
  captured_at: Date | null;
  approved_at: Date | null;
}

const META_COLUMNS = `filename, page_count, page_size, content, css, font_links, capture_messages,
       context, uploaded_at, captured_at, approved_at`;

function mapRow(r: RawRow): ResumeRow {
  return {
    filename: r.filename,
    pageCount: r.page_count,
    pageSize: r.page_size,
    content: r.content,
    css: r.css,
    fontLinks: r.font_links,
    captureMessages: r.capture_messages,
    context: r.context,
    uploadedAt: r.uploaded_at,
    capturedAt: r.captured_at,
    approvedAt: r.approved_at,
  };
}

export async function getResume(): Promise<ResumeRow | null> {
  const { rows } = await pool.query<RawRow>(`SELECT ${META_COLUMNS} FROM resume WHERE id = 1`);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getResumePdf(): Promise<{ filename: string; data: Buffer } | null> {
  const { rows } = await pool.query<{ filename: string; data: Buffer }>(
    'SELECT filename, data FROM resume WHERE id = 1',
  );
  return rows[0] ?? null;
}

/** Replace the stored resume; resets every capture field (the design belongs to the old file). */
export async function upsertResume(
  filename: string,
  data: Buffer,
  pageCount: number,
  pageSize: PageSize,
): Promise<void> {
  await pool.query(
    `INSERT INTO resume (id, filename, data, page_count, page_size)
     VALUES (1, $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       filename = EXCLUDED.filename,
       data = EXCLUDED.data,
       page_count = EXCLUDED.page_count,
       page_size = EXCLUDED.page_size,
       content = NULL,
       css = NULL,
       font_links = '[]'::jsonb,
       capture_messages = '[]'::jsonb,
       uploaded_at = now(),
       captured_at = NULL,
       approved_at = NULL`,
    [filename, data, pageCount, JSON.stringify(pageSize)],
  );
}

/** Store a capture (or refine) result. Refining after approval re-opens the review (approved_at NULL). */
export async function saveCapture(
  content: ResumeContent,
  css: string,
  fontLinks: string[],
  messages: ChatMsg[],
): Promise<void> {
  await pool.query(
    `UPDATE resume SET
       content = $1, css = $2, font_links = $3, capture_messages = $4,
       captured_at = now(), approved_at = NULL
     WHERE id = 1`,
    [JSON.stringify(content), css, JSON.stringify(fontLinks), JSON.stringify(messages)],
  );
}

export async function approveCapture(): Promise<void> {
  await pool.query('UPDATE resume SET approved_at = now() WHERE id = 1');
}

/** Save the private context notes (real experience beyond what the resume says). Preserved across
 * re-uploads — it describes the candidate, not the file. */
export async function saveContext(context: string): Promise<void> {
  await pool.query('UPDATE resume SET context = $1 WHERE id = 1', [context]);
}
