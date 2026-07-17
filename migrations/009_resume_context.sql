-- Private candidate context: real-experience notes that guide per-role resume tailoring and
-- interview prep (e.g. "resume says full-stack but backend is mostly theoretical"). NEVER shown on
-- the resume itself; separate from the resume content, which stays untouched. Preserved across
-- re-uploads (it describes the candidate, not the file).
ALTER TABLE resume ADD COLUMN context TEXT;
