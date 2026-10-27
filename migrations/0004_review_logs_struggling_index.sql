-- Speed correlated again_14d counts on GET /api/study/struggling.
CREATE INDEX IF NOT EXISTS idx_review_logs_card_reviewed
  ON review_logs (card_id, reviewed_at);
