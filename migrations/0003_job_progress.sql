-- Add durable progress snapshot for generation job polling (progress system design §4)

ALTER TABLE generation_jobs ADD COLUMN progress_json TEXT;
