-- Apply only after scripts/backfill-card-content-fp.mjs has archived live null-claim extras.
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_deck_content_fp_live
  ON cards (deck_id, content_fp)
  WHERE claim_id IS NULL
    AND content_fp IS NOT NULL
    AND status IN ('draft', 'accepted');
