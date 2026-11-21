-- Student-suggested dataset corrections for admin review. Personal edits
-- stay in atlas_entries; this table only queues the diff vs the bundle.

CREATE TABLE atlas_correction_suggestions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  atlas_id TEXT NOT NULL REFERENCES atlases (id) ON DELETE CASCADE,
  origin_key TEXT NOT NULL,
  dataset_version INTEGER NOT NULL,
  diff_json TEXT NOT NULL,
  note TEXT,
  source_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'accepted', 'rejected')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);
CREATE UNIQUE INDEX idx_correction_open
  ON atlas_correction_suggestions (user_id, origin_key) WHERE status = 'open';
CREATE INDEX idx_correction_status ON atlas_correction_suggestions (status, created_at);
