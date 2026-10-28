ALTER TABLE materials ADD COLUMN content_hash TEXT;
CREATE INDEX idx_materials_deck_content_hash ON materials (deck_id, content_hash);
