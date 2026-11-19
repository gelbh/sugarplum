-- One live card per study claim (null claim_id still allowed for rules/vision/gap-fill).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_claim_unique
  ON cards (claim_id)
  WHERE claim_id IS NOT NULL;
