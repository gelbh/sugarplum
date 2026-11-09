ALTER TABLE user_study_prefs ADD COLUMN desired_retention REAL NOT NULL DEFAULT 0.9;
ALTER TABLE user_study_prefs ADD COLUMN enable_fuzz INTEGER NOT NULL DEFAULT 1;
