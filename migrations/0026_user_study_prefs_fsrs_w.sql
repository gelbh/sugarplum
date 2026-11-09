ALTER TABLE user_study_prefs ADD COLUMN fsrs_w_json TEXT;
ALTER TABLE user_study_prefs ADD COLUMN fsrs_last_optimized_at TEXT;
ALTER TABLE user_study_prefs ADD COLUMN fsrs_optimize_pending INTEGER NOT NULL DEFAULT 0;
