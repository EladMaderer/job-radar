-- Simplify the resume feature: drop the design-capture / tailored-PDF flow entirely. We keep the
-- uploaded PDF + the private context, add the extracted resume TEXT, and per job we now generate
-- textual GUIDANCE (what to emphasize) instead of a rendered tailored resume.

ALTER TABLE resume ADD COLUMN resume_text TEXT;

-- Dead capture-era columns.
ALTER TABLE resume DROP COLUMN IF EXISTS content;
ALTER TABLE resume DROP COLUMN IF EXISTS css;
ALTER TABLE resume DROP COLUMN IF EXISTS font_links;
ALTER TABLE resume DROP COLUMN IF EXISTS capture_messages;
ALTER TABLE resume DROP COLUMN IF EXISTS captured_at;
ALTER TABLE resume DROP COLUMN IF EXISTS approved_at;
ALTER TABLE resume DROP COLUMN IF EXISTS page_count;
ALTER TABLE resume DROP COLUMN IF EXISTS page_size;

-- The tailored-resume store is gone; guidance replaces it.
DROP TABLE IF EXISTS job_tailors;

CREATE TABLE job_guidance (
  job_id     INT PRIMARY KEY,               -- no FK: jobs rows are deleted on re-baselines
  company    TEXT NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,                 -- markdown: what this role wants emphasized in the resume
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
