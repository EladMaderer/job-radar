-- Re-key the TheirStack credit meter by BILLING-PERIOD START instead of calendar month. The paid
-- plan renews on the 16th (anniversary), so a calendar-month key would reset on the 1st while
-- TheirStack keeps counting the 16th→16th window — the guard would show green past the real cap.
ALTER TABLE theirstack_usage RENAME COLUMN month TO period_start; -- now 'YYYY-MM-DD'

-- Carry the existing free-tier row ('2026-07', 167) into the current billing period (Jul 16 start)
-- as a CONSERVATIVE floor so the guard isn't blind. This value is UNVERIFIED — it predates the paid
-- plan — so it must be reconciled against TheirStack's dashboard and corrected with the real number.
UPDATE theirstack_usage SET period_start = '2026-07-16' WHERE period_start = '2026-07';
