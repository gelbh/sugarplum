-- Atlas ownership moves from subjects to users. One Parasitology Atlas per
-- user for now (UNIQUE user_id + template_key). Drop subject_id.

PRAGMA foreign_keys = OFF;

ALTER TABLE atlases ADD COLUMN user_id TEXT REFERENCES users (id) ON DELETE CASCADE;

UPDATE atlases
SET user_id = (
  SELECT s.user_id FROM subjects s WHERE s.id = atlases.subject_id
);

DELETE FROM atlases WHERE user_id IS NULL;

CREATE TABLE atlas_keep (
  id TEXT PRIMARY KEY NOT NULL
);

INSERT INTO atlas_keep (id)
SELECT id FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, template_key
      ORDER BY created_at DESC, id ASC
    ) AS rn
  FROM atlases
) WHERE rn = 1;

DELETE FROM atlas_entry_focus
WHERE atlas_id NOT IN (SELECT id FROM atlas_keep);

DELETE FROM atlas_entries
WHERE atlas_id NOT IN (SELECT id FROM atlas_keep);

DELETE FROM atlases
WHERE id NOT IN (SELECT id FROM atlas_keep);

DROP TABLE atlas_keep;

CREATE TABLE atlases_new (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  template_key TEXT NOT NULL CHECK (template_key IN ('parasite')),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, template_key)
);

INSERT INTO atlases_new (id, user_id, template_key, created_at)
SELECT id, user_id, template_key, created_at FROM atlases;

DROP TABLE atlases;
ALTER TABLE atlases_new RENAME TO atlases;

CREATE INDEX idx_atlases_user ON atlases (user_id);

PRAGMA foreign_keys = ON;
