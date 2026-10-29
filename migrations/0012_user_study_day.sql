CREATE TABLE user_study_day (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  intros_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
