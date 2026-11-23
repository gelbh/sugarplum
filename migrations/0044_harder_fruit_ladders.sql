-- Harder fruit ladders: curated in-place retune. Keep ids and completions.
-- Kiwi unchanged (distinct_types ceiling). catalog_version unchanged.

UPDATE achievement_defs SET threshold = 50, description = 'Complete 50 reviews.' WHERE id = 'reviews_25';
UPDATE achievement_defs SET threshold = 250, description = 'Complete 250 reviews.' WHERE id = 'reviews_100';
UPDATE achievement_defs SET threshold = 1000, description = 'Complete 1,000 reviews.' WHERE id = 'reviews_500';
UPDATE achievement_defs SET threshold = 5000, description = 'Complete 5,000 reviews.' WHERE id = 'reviews_2000';

UPDATE achievement_defs SET threshold = 50, description = 'Accept 50 cards.' WHERE id = 'accepts_25';
UPDATE achievement_defs SET threshold = 250, description = 'Accept 250 cards.' WHERE id = 'accepts_100';
UPDATE achievement_defs SET threshold = 750, description = 'Accept 750 cards.' WHERE id = 'accepts_300';
UPDATE achievement_defs SET threshold = 2500, description = 'Accept 2,500 cards.' WHERE id = 'accepts_1000';

UPDATE achievement_defs SET threshold = 7, title = 'Week of seeds', description = 'Study on 7 distinct days.' WHERE id = 'study_days_3';
UPDATE achievement_defs SET threshold = 30, title = 'Month berry', description = 'Study on 30 distinct days.' WHERE id = 'study_days_14';
UPDATE achievement_defs SET threshold = 100, description = 'Study on 100 distinct days.' WHERE id = 'study_days_50';
UPDATE achievement_defs SET threshold = 250, description = 'Study on 250 distinct days.' WHERE id = 'study_days_150';

UPDATE achievement_defs SET threshold = 5, description = 'Have 5 decks with accepted cards.' WHERE id = 'library_3';
UPDATE achievement_defs SET threshold = 10, description = 'Have 10 decks with accepted cards.' WHERE id = 'library_5';
UPDATE achievement_defs SET threshold = 25, description = 'Have 25 decks with accepted cards.' WHERE id = 'library_10';
UPDATE achievement_defs SET threshold = 50, description = 'Have 50 decks with accepted cards.' WHERE id = 'library_20';

UPDATE achievement_defs SET threshold = 7, description = 'Clear your due queue on 7 different days.' WHERE id = 'clear_due_3';
UPDATE achievement_defs SET threshold = 21, description = 'Clear your due queue on 21 different days.' WHERE id = 'clear_due_10';
UPDATE achievement_defs SET threshold = 60, description = 'Clear your due queue on 60 different days.' WHERE id = 'clear_due_30';
UPDATE achievement_defs SET threshold = 180, description = 'Clear your due queue on 180 different days.' WHERE id = 'clear_due_100';

UPDATE achievement_defs SET threshold = 25, description = 'Review 25 cards you last saw 30+ days ago.' WHERE id = 'long_reviews_10';
UPDATE achievement_defs SET threshold = 100, description = 'Review 100 cards you last saw 30+ days ago.' WHERE id = 'long_reviews_50';
UPDATE achievement_defs SET threshold = 350, description = 'Review 350 cards you last saw 30+ days ago.' WHERE id = 'long_reviews_150';
UPDATE achievement_defs SET threshold = 1000, description = 'Review 1,000 cards you last saw 30+ days ago.' WHERE id = 'long_reviews_400';

UPDATE achievement_defs SET threshold = 25, description = 'Grow 25 cards to a 21+ day interval.' WHERE id = 'mature_10';
UPDATE achievement_defs SET threshold = 100, description = 'Grow 100 cards to a 21+ day interval.' WHERE id = 'mature_50';
UPDATE achievement_defs SET threshold = 400, description = 'Grow 400 cards to a 21+ day interval.' WHERE id = 'mature_200';
UPDATE achievement_defs SET threshold = 1000, description = 'Grow 1,000 cards to a 21+ day interval.' WHERE id = 'mature_500';

UPDATE achievement_defs SET threshold = 7, title = 'Cherry week', description = 'Reach a 7-day study streak.' WHERE id = 'streak_5';
UPDATE achievement_defs SET threshold = 14, title = 'Fortnight cherry', description = 'Reach a 14-day study streak.' WHERE id = 'streak_7';
UPDATE achievement_defs SET threshold = 45, description = 'Reach a 45-day study streak.' WHERE id = 'streak_21';
UPDATE achievement_defs SET threshold = 120, description = 'Reach a 120-day study streak.' WHERE id = 'streak_60';

UPDATE achievement_defs SET threshold = 8, description = 'Reach level 8.' WHERE id = 'level_5';
UPDATE achievement_defs SET threshold = 14, description = 'Reach level 14.' WHERE id = 'level_10';
UPDATE achievement_defs SET threshold = 20, description = 'Reach level 20.' WHERE id = 'level_15';
UPDATE achievement_defs SET threshold = 28, description = 'Reach level 28.' WHERE id = 'level_20';

UPDATE achievement_defs SET
  params_json = '{"streak_best_min":7,"reviews_min":100}',
  description = 'Best streak 7+ and 100 lifetime reviews.'
WHERE id = 'plum_blossom';
UPDATE achievement_defs SET
  params_json = '{"streak_best_min":14,"reviews_min":250}',
  description = 'Best streak 14+ and 250 lifetime reviews.'
WHERE id = 'plum_ripening';
UPDATE achievement_defs SET
  params_json = '{"streak_best_min":30,"reviews_min":750}',
  description = 'Best streak 30+ and 750 lifetime reviews.'
WHERE id = 'plum_orchard';
UPDATE achievement_defs SET
  params_json = '{"streak_best_min":60,"reviews_min":2000}',
  description = 'Best streak 60+ and 2,000 lifetime reviews.'
WHERE id = 'plum_scholar';
