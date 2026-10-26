-- Unique OAuth subjects (NULL allowed for password-only users)
CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_subject_unique
  ON users (oauth_subject)
  WHERE oauth_subject IS NOT NULL;
