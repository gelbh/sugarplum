/** Minimum account review_logs rows before FSRS weight optimize is allowed. */
export const FSRS_MIN_REVIEWS = 400;

/** Days after last optimize before auto-retrain is due again. */
export const FSRS_RETRAIN_DAYS = 30;

/** Max users marked pending per daily cron tick. */
export const FSRS_CRON_MARK_LIMIT = 50;

/** Binding next-day hour (UTC) for convertCsvToFsrsItems. */
export const FSRS_NEXT_DAY_STARTS_AT = 4;
