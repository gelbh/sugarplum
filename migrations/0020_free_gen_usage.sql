-- Free-gen daily quota counter; reserve is an atomic conditional upsert
CREATE TABLE free_gen_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
