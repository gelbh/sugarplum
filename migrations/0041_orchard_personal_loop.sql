-- Orchard personal loop: streak freezes + daily review goal
ALTER TABLE user_gamification ADD COLUMN streak_freezes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_gamification ADD COLUMN daily_goal_reviews INTEGER NOT NULL DEFAULT 20;
ALTER TABLE user_gamification ADD COLUMN daily_goal_day TEXT;

CREATE TABLE streak_freeze_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  consumed_at TEXT NOT NULL,
  streak_at_consume INTEGER NOT NULL
);

CREATE INDEX streak_freeze_events_user ON streak_freeze_events (user_id, consumed_at);
