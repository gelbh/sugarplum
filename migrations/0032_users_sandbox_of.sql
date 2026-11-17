ALTER TABLE users ADD COLUMN sandbox_of TEXT REFERENCES users (id) ON DELETE SET NULL;
CREATE INDEX idx_users_sandbox_of ON users (sandbox_of);
