-- Clear-due day counter for the pear ladder; replaces the one-shot clear_due_once trigger.
ALTER TABLE user_gamification ADD COLUMN clear_due_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_gamification ADD COLUMN clear_due_last_day TEXT;
ALTER TABLE user_gamification ADD COLUMN catalog_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE achievement_defs ADD COLUMN catalog_version INTEGER NOT NULL DEFAULT 1;

UPDATE achievement_defs SET trigger_kind = 'clear_due_days' WHERE id = 'clear_due_1';
