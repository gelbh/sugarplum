-- Optional Atlas entry provenance for Make cards jobs (step 6).
ALTER TABLE generation_jobs ADD COLUMN atlas_provenance_json TEXT;
