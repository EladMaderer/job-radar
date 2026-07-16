CREATE TYPE job_status AS ENUM ('new', 'interested', 'applied', 'rejected', 'interview');

CREATE TABLE jobs (
  id            SERIAL PRIMARY KEY,
  source        TEXT NOT NULL,                        -- 'greenhouse' | 'lever'
  external_id   TEXT NOT NULL,
  company       TEXT NOT NULL,
  title         TEXT NOT NULL,
  location      TEXT,
  url           TEXT NOT NULL,
  description   TEXT,
  posted_at     TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),   -- when this radar first saw it; never changes
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),   -- refreshed every poll; stale => likely delisted/filled
  fit_score     INT,
  why           TEXT,
  status        job_status NOT NULL DEFAULT 'new',    -- user-managed in Phase 2 dashboard; never overwritten by polling
  UNIQUE (source, external_id)
);

-- Dashboard read patterns (Phase 2): browse by recency and by score.
CREATE INDEX jobs_first_seen_at_idx ON jobs (first_seen_at DESC);
CREATE INDEX jobs_fit_score_idx ON jobs (fit_score DESC);
