CREATE TABLE calendar_connections (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_ciphertext TEXT NOT NULL,
  scopes TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE calendar_subject_links (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  cluster_key TEXT NOT NULL,
  subject_id TEXT NOT NULL REFERENCES subjects (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, cluster_key)
);

CREATE TABLE calendar_dismissals (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  cluster_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, cluster_key)
);
