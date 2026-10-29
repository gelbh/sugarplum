-- Soft-disable flag for admin user monitor (P3)
ALTER TABLE users ADD COLUMN disabled_at TEXT;
