-- Short free-text note attached to a job's status — e.g. why it was rejected. User-owned, like
-- `status` itself: the poller never writes it. VARCHAR(30) enforces the length cap in the DB, so
-- an over-long note is rejected at the last line of defence, not just in the UI.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status_note VARCHAR(30);
