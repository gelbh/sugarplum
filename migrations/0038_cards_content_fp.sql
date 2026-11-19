-- Transitional content fingerprint (unique index applied in 0039 after backfill).
ALTER TABLE cards ADD COLUMN content_fp TEXT;
CREATE INDEX IF NOT EXISTS idx_cards_deck_content_fp
  ON cards (deck_id, content_fp);
