ALTER TABLE materials ADD COLUMN source_role TEXT NOT NULL DEFAULT 'lecture'
  CHECK (source_role IN ('lecture', 'tutorial', 'practical', 'past_paper', 'notes'));
