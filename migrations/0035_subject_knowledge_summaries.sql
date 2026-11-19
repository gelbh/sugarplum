-- Denormalized per-subject knowledge buckets + recall snapshot for composition-summaries.
CREATE TABLE subject_knowledge_summaries (
  subject_id TEXT PRIMARY KEY NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  new_count INTEGER NOT NULL DEFAULT 0,
  learning_count INTEGER NOT NULL DEFAULT 0,
  young_count INTEGER NOT NULL DEFAULT 0,
  mature_count INTEGER NOT NULL DEFAULT 0,
  recall_card_count INTEGER NOT NULL DEFAULT 0,
  r_sum REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_subject_knowledge_summaries_user
  ON subject_knowledge_summaries (user_id);
