-- Fruit achievements + XP + streak (Approach C, phase 1)

CREATE TABLE achievement_defs (
  id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL,
  fruit_type TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (
    rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')
  ),
  trigger_kind TEXT NOT NULL,
  threshold INTEGER,
  params_json TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE achievement_progress (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievement_defs (id) ON DELETE CASCADE,
  current_value INTEGER NOT NULL DEFAULT 0,
  threshold INTEGER NOT NULL,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE achievement_completions (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievement_defs (id) ON DELETE CASCADE,
  completed_at TEXT NOT NULL,
  trigger_event_id TEXT,
  backdated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE user_gamification (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  streak_current INTEGER NOT NULL DEFAULT 0,
  streak_best INTEGER NOT NULL DEFAULT 0,
  streak_day TEXT,
  xp_total INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  display_name TEXT,
  board_opt_in INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE xp_ledger (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX xp_ledger_user_created ON xp_ledger (user_id, created_at);

INSERT INTO achievement_defs (
  id, category, fruit_type, rarity, trigger_kind, threshold, params_json,
  title, description, sort_order, active
) VALUES
  ('reviews_1', 'reviews', 'apple', 'common', 'reviews_total', 1, NULL,
   'First bite', 'Complete your first review.', 10, 1),
  ('reviews_25', 'reviews', 'apple', 'uncommon', 'reviews_total', 25, NULL,
   'Crisp apple', 'Complete 25 reviews.', 20, 1),
  ('reviews_100', 'reviews', 'apple', 'rare', 'reviews_total', 100, NULL,
   'Orchard regular', 'Complete 100 reviews.', 30, 1),
  ('accepts_1', 'accepts', 'lemon', 'common', 'accepts_total', 1, NULL,
   'First zest', 'Accept your first card.', 40, 1),
  ('accepts_25', 'accepts', 'lemon', 'uncommon', 'accepts_total', 25, NULL,
   'Citrus stack', 'Accept 25 cards.', 50, 1),
  ('study_days_3', 'study_days', 'strawberry', 'uncommon', 'study_days_total', 3, NULL,
   'Three seeds', 'Study on 3 distinct days.', 60, 1),
  ('study_days_14', 'study_days', 'strawberry', 'rare', 'study_days_total', 14, NULL,
   'Fortnight berry', 'Study on 14 distinct days.', 70, 1),
  ('clear_due_1', 'clear_due', 'pear', 'uncommon', 'clear_due_once', 1, NULL,
   'Empty basket', 'Clear your due queue once.', 80, 1),
  ('streak_7', 'streak', 'cherry', 'rare', 'streak_current', 7, NULL,
   'Week of cherries', 'Reach a 7-day study streak.', 90, 1),
  ('streak_21', 'streak', 'cherry', 'epic', 'streak_current', 21, NULL,
   'Triple cherry', 'Reach a 21-day study streak.', 100, 1),
  ('types_2', 'breadth', 'kiwi', 'rare', 'distinct_types', 2, NULL,
   'Two slices', 'Accept cards of 2 different types.', 110, 1),
  ('plum_scholar', 'prestige', 'plum', 'legendary', 'composite', NULL,
   '{"streak_best_min":30,"reviews_min":200}',
   'Sugar plum', 'Best streak 30+ and 200 lifetime reviews.', 120, 1);
