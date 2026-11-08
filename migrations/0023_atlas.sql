-- Subject Atlas (spec 2026-11-08-subject-atlas-design.md §1).
-- One atlas per subject; entries are per-user because they derive from the
-- learner's own uploaded materials.

CREATE TABLE atlases (
  id TEXT PRIMARY KEY NOT NULL,
  subject_id TEXT NOT NULL UNIQUE REFERENCES subjects (id) ON DELETE CASCADE,
  template_key TEXT NOT NULL CHECK (template_key IN ('parasite')),
  created_at TEXT NOT NULL
);

CREATE TABLE atlas_entries (
  id TEXT PRIMARY KEY NOT NULL,
  atlas_id TEXT NOT NULL REFERENCES atlases (id) ON DELETE CASCADE,
  canonical_name TEXT NOT NULL,
  common_name TEXT,
  fields_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'accepted', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (atlas_id, canonical_name)
);

CREATE INDEX idx_atlas_entries_atlas_status ON atlas_entries (atlas_id, status);

CREATE TABLE atlas_field_sources (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL REFERENCES atlas_entries (id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  material_id TEXT NOT NULL REFERENCES materials (id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  excerpt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_atlas_field_sources_entry ON atlas_field_sources (entry_id);
CREATE INDEX idx_atlas_field_sources_material ON atlas_field_sources (material_id);
