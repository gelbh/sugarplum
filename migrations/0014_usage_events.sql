-- Durable LLM usage rows for admin metering (P4b)
CREATE TABLE usage_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT UNIQUE,
  kind TEXT NOT NULL,
  path TEXT,
  provider TEXT,
  tokens_prompt INTEGER,
  tokens_completion INTEGER,
  tokens_total INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX usage_events_user_created ON usage_events(user_id, created_at);
