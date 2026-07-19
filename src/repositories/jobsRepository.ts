import type { Job } from '../ats/types.js';
import { pool } from '../db/pool.js';
import type { JobAlert } from '../notify/types.js';

/**
 * All SQL for the `jobs` table. The DB is both the history and the dedup memory, so these
 * functions are the only place rows are read or written.
 *
 * Invariants: inserts/updates NEVER touch `first_seen_at` or `status` after creation
 * (status is user-owned in the Phase 2 dashboard); rows are never deleted.
 */

/**
 * Sources that already have rows. A source NOT in this set is on its first-ever run and
 * baseline-seeds silently (stored + marked alerted, no Telegram) — per-source, so adding a new
 * source (e.g. TheirStack) to an already-populated DB doesn't fire alerts for pre-existing jobs.
 */
export async function sourcesWithRows(): Promise<Set<string>> {
  const { rows } = await pool.query<{ source: string }>('SELECT DISTINCT source FROM jobs');
  return new Set(rows.map((r) => r.source));
}

/**
 * TheirStack credits consumed in the billing period keyed by `periodStart` ('YYYY-MM-DD' UTC). The
 * accurate credit meter: TheirStack bills per job RETURNED (not stored) and its balance doesn't
 * reset when we delete rows, so this lives in its own table and survives re-baselines. Keyed by
 * billing-period start (plan renews on an anniversary day), not calendar month.
 */
export async function theirStackCreditsUsed(periodStart: string): Promise<number> {
  const { rows } = await pool.query<{ credits: number }>(
    'SELECT credits FROM theirstack_usage WHERE period_start = $1',
    [periodStart],
  );
  return rows[0]?.credits ?? 0;
}

/** Add `credits` (= jobs returned by a run) to the running total for the billing period. */
export async function addTheirStackCreditsUsed(
  periodStart: string,
  credits: number,
): Promise<void> {
  if (credits <= 0) return;
  await pool.query(
    `INSERT INTO theirstack_usage (period_start, credits) VALUES ($1, $2)
     ON CONFLICT (period_start) DO UPDATE SET credits = theirstack_usage.credits + EXCLUDED.credits`,
    [periodStart, credits],
  );
}

/**
 * Incremental-fetch watermark for a source: when we last stored anything from it. Passed back to
 * TheirStack as discovered_at_gte (minus an overlap) so each job is returned — and billed — once.
 */
export async function latestFirstSeen(source: string): Promise<Date | null> {
  const { rows } = await pool.query<{ max: Date | null }>(
    'SELECT max(first_seen_at) AS max FROM jobs WHERE source = $1',
    [source],
  );
  return rows[0]?.max ?? null;
}

/**
 * Fuzzy cross-source duplicate check: does another source already have this company+title?
 * Safety net behind the server-side company exclusion — catches name variants so the same role
 * arriving via TheirStack after the ATS poller doesn't ping twice.
 */
export async function existsSimilarJob(
  company: string,
  title: string,
  excludeSource: string,
): Promise<boolean> {
  const { rows } = await pool.query<{ found: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM jobs
        WHERE source <> $1
          AND lower(btrim(title)) = lower(btrim($2))
          AND (lower(btrim(company)) = lower(btrim($3))
               OR lower(btrim(company)) LIKE lower(btrim($3)) || '%'
               OR lower(btrim($3)) LIKE lower(btrim(company)) || '%')
     ) AS found`,
    [excludeSource, title, company],
  );
  return rows[0]?.found ?? false;
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

/**
 * Insert a newly-seen job — including ones judged NOT relevant, so the decision is remembered and
 * the job is never re-scored (this is what stops irrelevant jobs from being re-billed on the LLM
 * every cycle). `relevant=false` rows are stored lean (no description) and hidden from the
 * dashboard. `alerted` controls alerted_at (true = silent baseline seed). ON CONFLICT DO NOTHING
 * guards against a race with a concurrent run.
 */
export async function insertJob(
  job: Job,
  fitScore: number,
  why: string,
  alerted: boolean,
  relevant: boolean,
): Promise<void> {
  await pool.query(
    `INSERT INTO jobs
       (source, external_id, company, title, location, url, description, posted_at, fit_score, why,
        alerted_at, relevant, recruiter_name, recruiter_linkedin, seniority, technology_slugs)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             CASE WHEN $11::boolean THEN now() ELSE NULL END, $12, $13, $14, $15, $16)
     ON CONFLICT (source, external_id) DO NOTHING`,
    [
      job.source,
      job.externalId,
      job.company,
      job.title,
      job.location,
      job.url,
      relevant ? job.description : null, // don't store descriptions for irrelevant rows
      job.postedAt,
      fitScore,
      why,
      alerted,
      relevant,
      job.recruiterName ?? null,
      job.recruiterLinkedIn ?? null,
      job.seniority ?? null,
      job.technologySlugs && job.technologySlugs.length > 0 ? job.technologySlugs : null,
    ],
  );
}

/**
 * Jobs that are owed an alert: above the threshold and never successfully sent. Includes both
 * freshly-inserted jobs and any whose send failed on a previous cycle, so alerts self-heal.
 * Highest score first; `limit` caps the batch per cycle.
 */
export async function findPendingAlerts(threshold: number, limit: number): Promise<JobAlert[]> {
  const { rows } = await pool.query<{
    id: number;
    company: string;
    title: string;
    location: string | null;
    url: string;
    fit_score: number;
    why: string;
    recruiter_name: string | null;
    recruiter_linkedin: string | null;
  }>(
    `SELECT id, company, title, location, url, fit_score, why, recruiter_name, recruiter_linkedin
       FROM jobs
      WHERE alerted_at IS NULL AND relevant = true AND fit_score >= $1
      ORDER BY fit_score DESC
      LIMIT $2`,
    [threshold, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    company: r.company,
    title: r.title,
    location: r.location,
    url: r.url,
    score: r.fit_score,
    why: r.why,
    recruiterName: r.recruiter_name,
    recruiterLinkedIn: r.recruiter_linkedin,
  }));
}

/** Total jobs still owed an alert (for the per-cycle "beyond cap" log). */
export async function countPendingAlerts(threshold: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'SELECT count(*)::int AS count FROM jobs WHERE alerted_at IS NULL AND relevant = true AND fit_score >= $1',
    [threshold],
  );
  return rows[0] ? Number(rows[0].count) : 0;
}

/** Mark a job alerted once its message has actually sent. */
export async function markAlerted(id: number): Promise<void> {
  await pool.query('UPDATE jobs SET alerted_at = now() WHERE id = $1', [id]);
}

/** A stored row reconstructed enough to re-score (one-off recalibration; see src/rescore.ts). */
export interface RescoreRow {
  id: number;
  oldScore: number | null;
  oldRelevant: boolean;
  job: Job;
}

/**
 * Relevant rows that still have a description, so they can be re-scored. Irrelevant rows are stored
 * lean (description=null) and can't be re-scored, but they're already hidden so it doesn't matter.
 */
export async function listRelevantForRescore(limit?: number): Promise<RescoreRow[]> {
  const { rows } = await pool.query<{
    id: number;
    source: string;
    external_id: string;
    company: string;
    title: string;
    location: string | null;
    url: string;
    description: string | null;
    posted_at: Date | null;
    seniority: string | null;
    technology_slugs: string[] | null;
    fit_score: number | null;
    relevant: boolean;
  }>(
    `SELECT id, source, external_id, company, title, location, url, description, posted_at,
            seniority, technology_slugs, fit_score, relevant
       FROM jobs
      WHERE relevant = true AND description IS NOT NULL
      ORDER BY id${limit ? ` LIMIT ${Number(limit)}` : ''}`,
  );
  return rows.map((r) => ({
    id: r.id,
    oldScore: r.fit_score,
    oldRelevant: r.relevant,
    // remote/countryCode aren't persisted (not needed by the LLM scorer, which reads the location
    // string); default them. The LLM re-derives location fit from `location` + description.
    job: {
      source: r.source,
      externalId: r.external_id,
      company: r.company,
      title: r.title,
      location: r.location,
      url: r.url,
      description: r.description,
      postedAt: r.posted_at,
      remote: false,
      countryCode: null,
      seniority: r.seniority,
      technologySlugs: r.technology_slugs ?? undefined,
    },
  }));
}

/**
 * Overwrite a job's score/relevance (one-off recalibration only — the poller never re-scores).
 * If a row flips to irrelevant, drop its description to match the lean-storage invariant.
 */
export async function updateScore(
  id: number,
  fitScore: number,
  why: string,
  relevant: boolean,
): Promise<void> {
  await pool.query(
    `UPDATE jobs SET fit_score = $2, why = $3, relevant = $4,
       description = CASE WHEN $4::boolean THEN description ELSE NULL END
     WHERE id = $1`,
    [id, fitScore, why, relevant],
  );
}

// --- Dashboard read layer (Phase 2) ---------------------------------------------------------

export const JOB_STATUSES = [
  'new',
  'interested',
  'applied',
  'rejected',
  'interview',
  'not_interested',
  'halted', // no longer accepting applications — set automatically, overridable by hand
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Max length of the free-text status note. Mirrored by VARCHAR(30) in migration 013 and by the
 * maxLength on the input in the web UI — validated here so the API is the authority. */
export const STATUS_NOTE_MAX_LENGTH = 30;

/** One job row as the dashboard needs it. */
export interface JobListItem {
  id: number;
  source: string;
  company: string;
  title: string;
  location: string | null;
  url: string;
  fitScore: number | null;
  why: string | null;
  status: JobStatus;
  statusNote: string | null; // short user note on the status (e.g. why rejected)
  postedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

/** Whitelisted sort keys -> columns. Whitelisting keeps the ORDER BY clause injection-proof. */
export const SORT_COLUMNS = {
  score: 'fit_score',
  firstSeen: 'first_seen_at',
  posted: 'posted_at',
  company: 'company',
  title: 'title',
  status: 'status',
} as const;

export type SortKey = keyof typeof SORT_COLUMNS;
export type SortOrder = 'asc' | 'desc';

export interface ListJobsFilters {
  status?: JobStatus;
  minScore?: number;
  search?: string; // matches title or company, case-insensitive
  maxAgeDays?: number; // hide jobs posted more than N days ago (0/undefined = no age filter)
  sort?: SortKey;
  order?: SortOrder;
  limit?: number;
  offset?: number;
}

const LIST_DEFAULT_LIMIT = 100;
const LIST_MAX_LIMIT = 500;
const DEFAULT_SORT: SortKey = 'firstSeen';
const DEFAULT_ORDER: SortOrder = 'desc';

/** Columns selected/returned for a dashboard job row (kept in one place for list + update). */
const JOB_ROW_COLUMNS = `id, source, company, title, location, url, fit_score, why, status,
            status_note, posted_at, first_seen_at, last_seen_at`;

interface JobRow {
  id: number;
  source: string;
  company: string;
  title: string;
  location: string | null;
  url: string;
  fit_score: number | null;
  why: string | null;
  status: JobStatus;
  status_note: string | null;
  posted_at: Date | null;
  first_seen_at: Date;
  last_seen_at: Date;
}

function mapJobRow(r: JobRow): JobListItem {
  return {
    id: r.id,
    source: r.source,
    company: r.company,
    title: r.title,
    location: r.location,
    url: r.url,
    fitScore: r.fit_score,
    why: r.why,
    status: r.status,
    statusNote: r.status_note,
    postedAt: r.posted_at,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
  };
}

/**
 * Read jobs for the dashboard, newest first, with optional filters. Parameterized throughout —
 * no string interpolation into SQL. Returns rows plus the total matching count for pagination.
 */
export async function listJobs(
  filters: ListJobsFilters = {},
): Promise<{ jobs: JobListItem[]; total: number }> {
  // Only relevant jobs by default. Irrelevant rows are stored purely as dedup memory (so the
  // scorer never re-processes them) and should never appear in the dashboard.
  // Postings that stopped accepting applications are NOT hidden — they get status 'halted' so they
  // stay visible and can be judged (and overridden) by hand.
  const where: string[] = ['relevant = true'];
  const params: unknown[] = [];

  if (filters.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  } else {
    // Hide "not interested" by default; it only shows when explicitly filtered to it.
    params.push('not_interested');
    where.push(`status <> $${params.length}`);
  }
  if (typeof filters.minScore === 'number') {
    params.push(filters.minScore);
    where.push(`fit_score >= $${params.length}`);
  }
  if (filters.search && filters.search.trim().length > 0) {
    params.push(`%${filters.search.trim()}%`);
    where.push(`(title ILIKE $${params.length} OR company ILIKE $${params.length})`);
  }
  if (typeof filters.maxAgeDays === 'number' && filters.maxAgeDays > 0) {
    // Hide stale postings (evergreen reqs open for months/years). Rows with an unknown post date
    // are kept — we can't judge their age, and dropping them would hide possibly-fresh jobs.
    params.push(filters.maxAgeDays);
    where.push(
      `(posted_at IS NULL OR posted_at >= now() - make_interval(days => $${params.length}::int))`,
    );
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const totalResult = await pool.query<{ count: string }>(
    `SELECT count(*)::int AS count FROM jobs ${whereSql}`,
    params,
  );
  const total = totalResult.rows[0] ? Number(totalResult.rows[0].count) : 0;

  const limit = Math.min(filters.limit ?? LIST_DEFAULT_LIMIT, LIST_MAX_LIMIT);
  const offset = Math.max(filters.offset ?? 0, 0);
  const limitParam = params.length + 1;
  const offsetParam = params.length + 2;

  const sortColumn = SORT_COLUMNS[filters.sort ?? DEFAULT_SORT];
  const sortDir = filters.order === 'asc' ? 'ASC' : filters.order === 'desc' ? 'DESC' : undefined;
  const dir = sortDir ?? (DEFAULT_ORDER === 'desc' ? 'DESC' : 'ASC');
  // sortColumn/dir come only from whitelists above, never user strings — safe to interpolate.
  // Tie-break on id so paging is stable when the sort column has duplicates.
  const { rows } = await pool.query<JobRow>(
    `SELECT ${JOB_ROW_COLUMNS}
       FROM jobs
       ${whereSql}
       ORDER BY ${sortColumn} ${dir} NULLS LAST, id DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
    [...params, limit, offset],
  );

  return { jobs: rows.map(mapJobRow), total };
}

/** One job with its description — the detail page + AI features need the full text. */
export interface JobDetail extends JobListItem {
  description: string | null;
}

export async function getJobById(id: number): Promise<JobDetail | null> {
  const { rows } = await pool.query<JobRow & { description: string | null }>(
    `SELECT ${JOB_ROW_COLUMNS}, description FROM jobs WHERE id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  return { ...mapJobRow(r), description: r.description };
}

/** Update a job's status (user-owned in the dashboard). Returns the updated row, or null if no
 * such job exists. The poller never writes status, so this is the only place it changes. */
export async function updateStatus(id: number, status: JobStatus): Promise<JobListItem | null> {
  const { rows } = await pool.query<JobRow>(
    `UPDATE jobs SET status = $2 WHERE id = $1 RETURNING ${JOB_ROW_COLUMNS}`,
    [id, status],
  );
  return rows[0] ? mapJobRow(rows[0]) : null;
}

/**
 * Set (or clear) a job's short status note. User-owned like `status` — the poller never writes it.
 * An empty/whitespace note clears the field. Returns the updated row, or null if no such job.
 */
export async function updateStatusNote(
  id: number,
  note: string | null,
): Promise<JobListItem | null> {
  const trimmed = note?.trim() ? note.trim().slice(0, STATUS_NOTE_MAX_LENGTH) : null;
  const { rows } = await pool.query<JobRow>(
    `UPDATE jobs SET status_note = $2 WHERE id = $1 RETURNING ${JOB_ROW_COLUMNS}`,
    [id, trimmed],
  );
  return rows[0] ? mapJobRow(rows[0]) : null;
}

/**
 * Refresh a job we've seen before: update the mutable fields and bump `last_seen_at`.
 * `first_seen_at`, `status`, `fit_score`, `why`, and `alerted_at` are deliberately left untouched —
 * the score is computed once at insert (re-scoring every cycle would re-spend LLM tokens for
 * nothing) and status/alert state are owned elsewhere.
 */
export async function updateJobFields(job: Job): Promise<void> {
  await pool.query(
    `UPDATE jobs SET
       company = $3, title = $4, location = $5, url = $6, description = $7,
       posted_at = $8, last_seen_at = now()
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
    ],
  );
}

// --- Closure reconciliation (Step 2) --------------------------------------------------------

/** A stored job reduced to what the reconciliation needs: its id and URL (URL routes the check —
 * LinkedIn postings are checked on LinkedIn, everything else via TheirStack's closed_at). */
export interface RecheckRef {
  externalId: string;
  url: string;
}

/**
 * Currently-VISIBLE, still-open jobs for a source, oldest-seen first — the set to re-check for
 * closure. Limited to relevant rows the user hasn't dispositioned ('new'/'interested'); once they've
 * applied or are interviewing, a posting closing is expected and we keep tracking it. `limit` bounds
 * the reconciliation's worst-case work/credit spend.
 */
export async function openJobsToRecheck(source: string, limit: number): Promise<RecheckRef[]> {
  const { rows } = await pool.query<{ external_id: string; url: string }>(
    `SELECT external_id, url FROM jobs
      WHERE source = $1 AND relevant = true
        AND status IN ('new', 'interested')
      ORDER BY first_seen_at ASC
      LIMIT $2`,
    [source, limit],
  );
  return rows.map((r) => ({ externalId: r.external_id, url: r.url }));
}

/** Jobs we've marked closed for a source — candidates to detect reopening. */
export async function closedJobsToRecheck(source: string, limit: number): Promise<RecheckRef[]> {
  const { rows } = await pool.query<{ external_id: string; url: string }>(
    `SELECT external_id, url FROM jobs
      WHERE source = $1 AND status = 'halted'
      ORDER BY closed_at ASC NULLS LAST
      LIMIT $2`,
    [source, limit],
  );
  return rows.map((r) => ({ externalId: r.external_id, url: r.url }));
}

/** Mark jobs closed (hidden from the dashboard). Only flips still-open rows. Returns rows updated. */
export async function markJobsHalted(
  source: string,
  entries: { externalId: string; closedAt: Date | null }[],
): Promise<number> {
  let updated = 0;
  for (const e of entries) {
    // Only auto-halt jobs still untouched ('new'/'interested'). Once you've applied/interviewed —
    // or manually moved a job off 'halted' — your status wins and is never overwritten.
    const { rowCount } = await pool.query(
      `UPDATE jobs SET status = 'halted', closed_at = COALESCE($3, now())
         WHERE source = $1 AND external_id = $2 AND status IN ('new', 'interested')`,
      [source, e.externalId, e.closedAt],
    );
    updated += rowCount ?? 0;
  }
  return updated;
}

/** A halted job started accepting again: back to 'new' so it re-enters the normal flow. */
export async function markJobsReopened(source: string, externalIds: string[]): Promise<number> {
  if (externalIds.length === 0) return 0;
  const { rowCount } = await pool.query(
    `UPDATE jobs SET status = 'new', closed_at = NULL
       WHERE source = $1 AND external_id = ANY($2::text[]) AND status = 'halted'`,
    [source, externalIds],
  );
  return rowCount ?? 0;
}
