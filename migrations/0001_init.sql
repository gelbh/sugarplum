-- Sugarplum D1 initial schema (design §5)

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  oauth_subject TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE user_secrets (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE decks (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject_hint TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE materials (
  id TEXT PRIMARY KEY NOT NULL,
  deck_id TEXT NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('paste', 'pdf', 'pptx', 'image')),
  r2_key TEXT,
  filename TEXT,
  page_count INTEGER,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE generation_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  material_id TEXT NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'needs_review', 'failed', 'done')
  ),
  error TEXT,
  coverage_json TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE cards (
  id TEXT PRIMARY KEY NOT NULL,
  deck_id TEXT NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  job_id TEXT REFERENCES generation_jobs (id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('qa', 'cloze', 'image_label', 'diagram')),
  front_json TEXT NOT NULL,
  back_json TEXT NOT NULL,
  media_r2_keys_json TEXT,
  provenance_json TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('draft', 'accepted', 'rejected', 'archived')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ts-fsrs Card shape: due, stability, difficulty, elapsed_days, scheduled_days,
-- learning_steps, reps, lapses, state, last_review
CREATE TABLE card_schedules (
  card_id TEXT PRIMARY KEY NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  due TEXT NOT NULL,
  stability REAL NOT NULL,
  difficulty REAL NOT NULL,
  elapsed_days REAL NOT NULL DEFAULT 0,
  scheduled_days REAL NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  state INTEGER NOT NULL DEFAULT 0,
  last_review TEXT
);

CREATE TABLE review_logs (
  id TEXT PRIMARY KEY NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  rating INTEGER NOT NULL,
  scheduled_days REAL NOT NULL,
  elapsed_days REAL NOT NULL,
  reviewed_at TEXT NOT NULL,
  state_json TEXT NOT NULL
);

CREATE INDEX idx_cards_deck_status ON cards (deck_id, status);
CREATE INDEX idx_card_schedules_due ON card_schedules (due);
CREATE INDEX idx_materials_deck ON materials (deck_id);
CREATE INDEX idx_generation_jobs_status ON generation_jobs (status);
