-- FSRS-7 memory: fast stability component (nullable until cutover rebuild).
ALTER TABLE card_schedules ADD COLUMN stability_fast REAL;
