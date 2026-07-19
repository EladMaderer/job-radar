-- Track when a source detected a posting was closed ("no longer accepting applications").
-- NULL = open or unknown — all existing rows and every non-TheirStack source stay NULL and visible.
-- The dashboard hides rows with a non-null closed_at; the TheirStack reconciliation pass sets it
-- when TheirStack reports a job closed, and clears it again if the job reopens.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
