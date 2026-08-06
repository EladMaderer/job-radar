-- Collapse duplicate postings: the same role reposted under different company display names (e.g.
-- NVIDIA reposting via several LinkedIn legal entities — "NVIDIA AI", "NVIDIA Development France
-- SAS", "NVIDIA"). Storage dedup is (source, external_id), and existsSimilarJob only matches ACROSS
-- sources AND requires the company to match — so same-source variants with a different company slip
-- through. The reliable signal is title + description, company-independent.
--
-- content_hash is a STORED generated column: computed once here for every existing row, and
-- automatically for every future insert, with normalization living in ONE place (this expression).
-- NULL when there's no description (title alone is too weak to dedup on — it would collapse unrelated
-- roles that share a generic title). Uses the first 500 normalized chars so trailing per-entity
-- boilerplate doesn't defeat the match.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS content_hash TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN description IS NOT NULL AND btrim(description) <> '' THEN
        md5(
          regexp_replace(lower(btrim(title)), '\s+', ' ', 'g')
          || E'\n'
          || left(regexp_replace(lower(btrim(description)), '\s+', ' ', 'g'), 500)
        )
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS jobs_content_hash_idx ON jobs (content_hash)
  WHERE content_hash IS NOT NULL;

-- One-time cleanup of duplicates already stored: within each content_hash group keep the best row
-- (highest score, then earliest seen) and hide the rest by flipping them to relevant=false — the
-- same mechanism that already keeps irrelevant rows off the dashboard. The poller keeps this state
-- going forward (hideDuplicateJobs runs every cycle), so this backfill only has to run once.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY content_hash
    ORDER BY fit_score DESC NULLS LAST, first_seen_at ASC, id ASC
  ) AS rn
  FROM jobs
  WHERE relevant = true AND content_hash IS NOT NULL
)
UPDATE jobs j
   SET relevant = false,
       why = 'duplicate posting (same title + description) — hidden by dedup'
  FROM ranked r
 WHERE j.id = r.id AND r.rn > 1;
