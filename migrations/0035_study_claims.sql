CREATE TABLE study_claims (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL REFERENCES generation_jobs (id) ON DELETE CASCADE,
  deck_id TEXT NOT NULL REFERENCES decks (id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  source_span TEXT NOT NULL,
  object TEXT,
  qualifiers_json TEXT,
  pages_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_study_claims_job ON study_claims (job_id);
CREATE INDEX idx_study_claims_deck ON study_claims (deck_id);

ALTER TABLE cards ADD COLUMN claim_id TEXT REFERENCES study_claims (id) ON DELETE SET NULL;
CREATE INDEX idx_cards_claim ON cards (claim_id);
