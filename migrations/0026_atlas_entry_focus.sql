-- Focus scan cache per Atlas entry (Key / Frequent / Standard).
-- Keyed by dataset origin_key when present, else learner-added atlas_entries.id.
-- Unedited dataset entries often have no overlay row; this table avoids creating
-- overlays solely to store Focus.

CREATE TABLE atlas_entry_focus (
  atlas_id TEXT NOT NULL REFERENCES atlases (id) ON DELETE CASCADE,
  entry_key TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('key', 'frequent', 'standard')),
  reason TEXT NOT NULL,
  material_ids_json TEXT NOT NULL,
  override TEXT CHECK (
    override IS NULL OR override IN ('key', 'frequent', 'standard')
  ),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (atlas_id, entry_key)
);

CREATE INDEX idx_atlas_entry_focus_atlas ON atlas_entry_focus (atlas_id);
