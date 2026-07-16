import type { Job } from '../ats/types.js';
import { pool } from '../db/pool.js';

/**
 * All SQL for the `jobs` table. The DB is both the history and the dedup memory, so these
 * functions are the only place rows are read or written.
 *
 * Invariants: inserts/updates NEVER touch `first_seen_at` or `status` after creation
 * (status is user-owned in the Phase 2 dashboard); rows are never deleted.
 */

/** Total rows — used to detect the very first run (empty table => baseline-seed). */
export async function countJobs(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>('SELECT count(*)::int AS count FROM jobs');
  return rows[0] ? Number(rows[0].count) : 0;
}

/** Which of these external ids already exist for a source — the dedup check. */
export async function findExistingExternalIds(
  source: string,
  externalIds: string[],
): Promise<Set<string>> {
  if (externalIds.length === 0) return new Set();
  const { rows } = await pool.query<{ external_id: string }>(
    'SELECT external_id FROM jobs WHERE source = $1 AND external_id = ANY($2::text[])',
    [source, externalIds],
  );
  return new Set(rows.map((r) => r.external_id));
}

/** Insert a newly-seen job. ON CONFLICT DO NOTHING guards against a race with a concurrent run. */
export async function insertJob(job: Job, fitScore: number, why: string): Promise<void> {
  await pool.query(
    `INSERT INTO jobs
       (source, external_id, company, title, location, url, description, posted_at, fit_score, why)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (source, external_id) DO NOTHING`,
    [
      job.source,
      job.externalId,
      job.company,
      job.title,
      job.location,
      job.url,
      job.description,
      job.postedAt,
      fitScore,
      why,
    ],
  );
}

/**
 * Refresh a job we've seen before: update the mutable fields and bump `last_seen_at`.
 * `first_seen_at` and `status` are deliberately left untouched.
 */
export async function updateJobFields(job: Job, fitScore: number, why: string): Promise<void> {
  await pool.query(
    `UPDATE jobs SET
       company = $3, title = $4, location = $5, url = $6, description = $7,
       posted_at = $8, fit_score = $9, why = $10, last_seen_at = now()
     WHERE source = $1 AND external_id = $2`,
    [
      job.source,
      job.externalId,
      job.company,
      job.title,
      job.location,
      job.url,
      job.description,
      job.postedAt,
      fitScore,
      why,
    ],
  );
}
