-- Open-review EXISTS: cards filtered by job_id + status='draft'
CREATE INDEX IF NOT EXISTS idx_cards_job_status ON cards (job_id, status);
