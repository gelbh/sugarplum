-- Subject Atlas: one structured, browsable set of entries per subject.
-- Ownership is subjects.user_id; entries derive from that learner's own
-- uploaded materials, and each field value cites its material page.

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
  value_json TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_atlas_field_sources_unique ON atlas_field_sources (entry_id, field_key, material_id, page);
CREATE INDEX idx_atlas_field_sources_material ON atlas_field_sources (material_id);
