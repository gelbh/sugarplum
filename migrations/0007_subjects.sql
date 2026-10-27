-- Subjects own decks. subject_id is nullable here so existing decks keep
-- loading; 0008_subjects_backfill.sql assigns subject_id from subject_hint.
-- A later migration can enforce NOT NULL (SQLite needs a table rebuild).
-- Tests always insert subject_id.

CREATE TABLE subjects (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_subjects_user ON subjects (user_id);

ALTER TABLE decks ADD COLUMN subject_id TEXT REFERENCES subjects (id);

CREATE INDEX idx_decks_subject ON decks (subject_id);
