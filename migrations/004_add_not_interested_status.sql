-- New user-facing status. Idempotent; PG 12+ allows ADD VALUE inside a transaction (the value just
-- can't be USED in the same transaction — the migration only adds it).
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'not_interested';
