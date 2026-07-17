-- Phase 3 (application workbench): CV storage + per-job tailored resumes + interview preps.

-- Single-row resume store: the original PDF + the captured design (content JSON, CSS, fonts).
-- Single-user tool => exactly one active resume; a new upload replaces it and resets the capture.
CREATE TABLE resume (
  id               INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  filename         TEXT NOT NULL,
  data             BYTEA NOT NULL,                     -- original PDF (<=3MB, magic-byte checked)
  page_count       INT NOT NULL,
  page_size        JSONB NOT NULL,                     -- {"widthPt": ..., "heightPt": ...} from the PDF mediaBox
  content          JSONB,                              -- captured structured content (NULL until captured)
  css              TEXT,                               -- captured stylesheet targeting the fixed skeleton classes
  font_links       JSONB NOT NULL DEFAULT '[]'::jsonb, -- Google Fonts stylesheet URLs
  capture_messages JSONB NOT NULL DEFAULT '[]'::jsonb, -- design-refine chat: [{"role","text","at"}]
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_at      TIMESTAMPTZ,
  approved_at      TIMESTAMPTZ
);

-- Per-job tailored resume. NO foreign key: jobs rows are deleted on manual re-baselines, and the
-- tailoring work must survive that — so everything needed to display and continue is snapshotted.
CREATE TABLE job_tailors (
  job_id          INT PRIMARY KEY,
  company         TEXT NOT NULL,
  title           TEXT NOT NULL,
  url             TEXT NOT NULL,
  job_description TEXT NOT NULL,                       -- snapshot: chat turns must survive job deletion
  content         JSONB NOT NULL,                      -- current tailored content JSON (full copy)
  changes         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- latest turn's [{"where","what"}]
  note            TEXT,                                -- latest turn's short strategy note
  messages        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{"role","text","at"}], capped in code
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-shot interview prep per job. Same no-FK + snapshot rule.
CREATE TABLE interview_preps (
  job_id     INT PRIMARY KEY,
  company    TEXT NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,                            -- markdown
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
