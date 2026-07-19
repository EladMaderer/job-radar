-- 'halted' = the posting is no longer accepting applications (LinkedIn's "No longer accepting
-- applications", or TheirStack reporting the posting closed). Unlike the earlier closed_at-based
-- hiding, a halted job stays VISIBLE on the dashboard so it can be seen and overridden by hand.
-- Idempotent; PG 12+ allows ADD VALUE inside a transaction (the value just can't be USED in the
-- same transaction — this migration only adds it).
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'halted';
