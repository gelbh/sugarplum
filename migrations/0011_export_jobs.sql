CREATE TABLE export_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'failed')),
  request_json TEXT NOT NULL,
  r2_key TEXT,
  error TEXT,
  warning_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_export_jobs_user ON export_jobs (user_id, created_at);
