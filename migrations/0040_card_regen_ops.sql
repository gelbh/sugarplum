CREATE TABLE card_regen_ops (
  id TEXT PRIMARY KEY NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  regen_type TEXT NOT NULL CHECK (regen_type IN ('qa', 'cloze', 'mcq')),
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'done', 'failed')
  ),
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX idx_card_regen_ops_card_status
  ON card_regen_ops (card_id, status);

CREATE INDEX idx_card_regen_ops_user_created
  ON card_regen_ops (user_id, created_at);
