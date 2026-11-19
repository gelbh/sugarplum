-- Speed user-scoped joins: WHERE d.user_id = ? (due, struggling, composition, admin).
CREATE INDEX IF NOT EXISTS idx_decks_user ON decks (user_id);
