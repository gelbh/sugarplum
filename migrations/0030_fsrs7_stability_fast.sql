-- FSRS-7 memory: fast stability component (nullable until cutover rebuild).
ALTER TABLE card_schedules ADD COLUMN stability_fast REAL;

-- Account study prefs: model id (FSRS-7 after cutover).
ALTER TABLE user_study_prefs ADD COLUMN fsrs_model TEXT NOT NULL DEFAULT 'FSRS-7';
