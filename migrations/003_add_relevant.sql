-- Remember every scoring decision so a job is scored exactly once. Before this, jobs the scorer
-- judged irrelevant were NOT stored, so they looked "new" every cycle and were re-scored (re-billed
-- on the LLM) forever. Now irrelevant jobs are stored too, with relevant=false, and deduped.
ALTER TABLE jobs ADD COLUMN relevant BOOLEAN NOT NULL DEFAULT true;

-- Everything already stored was, by definition, relevant.
UPDATE jobs SET relevant = true WHERE relevant IS NULL;

-- The dashboard and alert queries filter on relevant; index it.
CREATE INDEX jobs_relevant_idx ON jobs (relevant);
