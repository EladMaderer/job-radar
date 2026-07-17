-- Accurate TheirStack credit meter. The old guard counted jobs we STORED, but TheirStack bills
-- per job RETURNED and its count doesn't reset when we delete rows (re-baseline). This table
-- tracks actual credits spent per calendar month and survives job-row deletes.
CREATE TABLE IF NOT EXISTS theirstack_usage (
  month   TEXT PRIMARY KEY,          -- 'YYYY-MM' (UTC)
  credits INTEGER NOT NULL DEFAULT 0 -- jobs returned by the API this month = credits consumed
);

-- One-time reconciliation: TheirStack's dashboard reported ~167/200 used for 2026-07 (dominated by
-- the 33-day backfill). Seed it so the guard reflects reality immediately instead of starting at 0.
INSERT INTO theirstack_usage (month, credits) VALUES ('2026-07', 167)
  ON CONFLICT (month) DO NOTHING;
