-- Decouple "seen" from "alerted": a job is stored on first sight, but only marked alerted once
-- its Telegram message actually sends. NULL alerted_at = still owed an alert.
ALTER TABLE jobs ADD COLUMN alerted_at TIMESTAMPTZ;

-- Existing rows are the baseline / already-known set — mark them alerted so they never ping
-- retroactively when this column goes live.
UPDATE jobs SET alerted_at = now() WHERE alerted_at IS NULL;

-- The poller scans for un-alerted, above-threshold jobs every cycle; index that lookup.
CREATE INDEX jobs_pending_alert_idx ON jobs (fit_score DESC) WHERE alerted_at IS NULL;
