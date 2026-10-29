// Anki time fields: `due` and `lastReview` are UTC unix seconds (integer).
// buildApkg converts review due to days since col.crt; learning/relearning stay unix.
// FSRS memory lives in cards.data as Anki `{s,d,lrt}`; cards.factor stays SM-2 ease.

export type AnkiFsrsFields = {
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: number | null;
};

export type ScheduleRowForAnki = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
};

function isoToUnixSeconds(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

export function mapScheduleToAnki(row: ScheduleRowForAnki): AnkiFsrsFields {
  return {
    due: isoToUnixSeconds(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsed_days,
    scheduledDays: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastReview: row.last_review ? isoToUnixSeconds(row.last_review) : null,
  };
}
