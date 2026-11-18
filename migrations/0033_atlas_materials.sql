-- Atlas-owned course pack materials (Focus ranking only; never generate cards).

CREATE TABLE atlas_materials (
  id TEXT PRIMARY KEY NOT NULL,
  atlas_id TEXT NOT NULL REFERENCES atlases (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('paste', 'pdf', 'pptx')),
  r2_key TEXT,
  filename TEXT,
  page_count INTEGER,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content_hash TEXT,
  source_role TEXT NOT NULL
    CHECK (source_role IN ('lecture', 'tutorial', 'practical', 'past_paper', 'notes'))
);

CREATE INDEX idx_atlas_materials_atlas ON atlas_materials (atlas_id);
CREATE INDEX idx_atlas_materials_atlas_hash ON atlas_materials (atlas_id, content_hash);
