-- Overlay model for the built-in parasite dataset: entries gain origin
-- tracking and soft-delete; field-page sources are replaced by refs and images.

ALTER TABLE atlas_entries ADD COLUMN origin_key TEXT;
ALTER TABLE atlas_entries ADD COLUMN origin_version INTEGER;
ALTER TABLE atlas_entries ADD COLUMN edited_at TEXT;
ALTER TABLE atlas_entries ADD COLUMN deleted_at TEXT;

DROP TABLE atlas_field_sources;

CREATE TABLE atlas_entry_refs (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL REFERENCES atlas_entries (id) ON DELETE CASCADE,
  field_key TEXT,
  citation TEXT NOT NULL,
  url TEXT,
  material_id TEXT REFERENCES materials (id) ON DELETE SET NULL,
  page INTEGER,
  note TEXT,
  user_added INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_atlas_entry_refs_entry ON atlas_entry_refs (entry_id);
CREATE INDEX idx_atlas_entry_refs_material ON atlas_entry_refs (material_id);

CREATE TABLE atlas_entry_images (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL REFERENCES atlas_entries (id) ON DELETE CASCADE,
  src TEXT NOT NULL,
  role TEXT CHECK (role IN (
    'adult',
    'egg_oocyst',
    'larva',
    'lifecycle_diagram',
    'lesion',
    'host',
    'other'
  )),
  caption TEXT,
  credit TEXT,
  license TEXT,
  source_url TEXT,
  is_hero INTEGER NOT NULL DEFAULT 0,
  user_added INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_atlas_entry_images_entry ON atlas_entry_images (entry_id);
