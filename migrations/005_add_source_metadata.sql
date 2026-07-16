-- Source-provided metadata (populated by TheirStack; NULL for ATS-board jobs). No backfill.
ALTER TABLE jobs ADD COLUMN recruiter_name TEXT;
ALTER TABLE jobs ADD COLUMN recruiter_linkedin TEXT;
ALTER TABLE jobs ADD COLUMN seniority TEXT;
ALTER TABLE jobs ADD COLUMN technology_slugs TEXT[];
