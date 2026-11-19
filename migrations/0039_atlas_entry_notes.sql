-- Personal study notepad per parasite, keyed like Focus so unedited
-- dataset entries do not need an atlas_entries overlay row.

CREATE TABLE atlas_entry_notes (
  atlas_id TEXT NOT NULL REFERENCES atlases (id) ON DELETE CASCADE,
  entry_key TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (atlas_id, entry_key)
);

CREATE INDEX idx_atlas_entry_notes_atlas ON atlas_entry_notes (atlas_id);
