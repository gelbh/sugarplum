-- Mirror r_floor to desired_retention (alias deferral floor).
UPDATE user_study_prefs SET r_floor = desired_retention;
