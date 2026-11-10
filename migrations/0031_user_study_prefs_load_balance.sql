ALTER TABLE user_study_prefs ADD COLUMN enable_load_balance INTEGER NOT NULL DEFAULT 1;
ALTER TABLE user_study_prefs ADD COLUMN easy_days_json TEXT NOT NULL DEFAULT '["normal","normal","normal","normal","normal","normal","normal"]';
