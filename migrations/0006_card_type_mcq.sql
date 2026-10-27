-- Expand cards.type CHECK to include 'mcq' (missed when MCQ cards shipped).
-- SQLite cannot ALTER CHECK; rebuild the table. Keep 'occlusion' from 0005.

PRAGMA foreign_keys = OFF;

CREATE TABLE cards_new (
  id TEXT PRIMARY KEY NOT NULL,
  deck_id TEXT NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  job_id TEXT REFERENCES generation_jobs (id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (
    type IN (
      'qa',
      'cloze',
      'image_label',
      'diagram',
      'occlusion',
      'mcq'
    )
  ),
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

INSERT INTO cards_new (
  id,
  deck_id,
  job_id,
  type,
  front_json,
  back_json,
  media_r2_keys_json,
  provenance_json,
  status,
  created_at,
  updated_at
)
SELECT
  id,
  deck_id,
  job_id,
  type,
  front_json,
  back_json,
  media_r2_keys_json,
  provenance_json,
  status,
  created_at,
  updated_at
FROM cards;

DROP TABLE cards;
ALTER TABLE cards_new RENAME TO cards;

CREATE INDEX idx_cards_deck_status ON cards (deck_id, status);

PRAGMA foreign_keys = ON;
