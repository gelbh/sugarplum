import { fsrs, State } from "ts-fsrs";
import { clampLearningStep } from "./fsrs/fsrsFactory";

export type ScheduleRowLike = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
  /** FSRS-7 fast stability; absent/null until cutover rebuild. */
  stability_fast?: number | null;
  /** Stable id for fuzz seeding when grading. */
  card_id?: string;
};

/** In-memory scheduler card (ts-fsrs v6 camelCase). */
export type FsrsSchedulerCard = {
  stability: number;
  difficulty: number;
  state: number;
  scheduleStatus: "new" | "learning" | "review" | string;
  dueAt: Date;
  lastReviewAt: Date | null;
  cardId: string;
  reps: number;
  lapses: number;
  scheduledDays: number;
  learningStep: number;
  stabilityFast?: number;
};

function scheduleStatusForState(state: number): string {
  switch (state) {
    case State.New:
      return "new";
    case State.Learning:
      return "learning";
    case State.Review:
      return "review";
    case State.Relearning:
      return "learning";
    default:
      return "new";
  }
}

/** Fresh empty FSRS card (sync; matches DefaultScheduler.newCard shape). */
export function emptyFsrsCard(
  now: Date = new Date(),
  cardId: string = crypto.randomUUID(),
): FsrsSchedulerCard {
  return {
    stability: 0,
    difficulty: 0,
    stabilityFast: 0,
    state: State.New,
    scheduleStatus: "new",
    dueAt: now,
    lastReviewAt: null,
    cardId,
    reps: 0,
    lapses: 0,
    scheduledDays: 0,
    learningStep: 0,
  };
}

export function cardFromScheduleRow(row: ScheduleRowLike): FsrsSchedulerCard {
  const hasFast =
    row.stability_fast != null &&
    Number.isFinite(row.stability_fast) &&
    row.stability_fast > 0;
  return {
    dueAt: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    // Missing fast → 0 until cutover rebuild (do not invent Sf = S).
    stabilityFast: hasFast ? row.stability_fast! : 0,
    scheduledDays: row.scheduled_days,
    learningStep: clampLearningStep(row.learning_steps),
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    scheduleStatus: scheduleStatusForState(row.state),
    lastReviewAt: row.last_review ? new Date(row.last_review) : null,
    cardId: row.card_id ?? crypto.randomUUID(),
  };
}

type ForgettingModel = {
  forgettingCurve: (memoryState: never, elapsedDays: number) => number;
};

/** Lazy default FSRS-6/7 scheduler models for sync R reads (warmed on first use). */
let rModel6: ForgettingModel | null = null;
let rModel7: ForgettingModel | null = null;
let rWarm: Promise<void> | null = null;

/** Prefetch DefaultScheduler models used by `retrievability` (optional). */
export function warmRetrievabilityModels(): Promise<void> {
  if (!rWarm) {
    rWarm = (async () => {
      const { DefaultScheduler } = await import("ts-fsrs");
      const [s6, s7] = await Promise.all([
        DefaultScheduler({ version: "FSRS-6", enableFuzz: false }),
        DefaultScheduler({ version: "FSRS-7", enableFuzz: false }),
      ]);
      rModel6 = s6.model as unknown as ForgettingModel;
      rModel7 = s7.model as unknown as ForgettingModel;
    })();
  }
  return rWarm;
}

/**
 * Numeric FSRS retrievability at `now`, or null when unavailable / on error.
 * Prefers warmed DefaultScheduler.model.forgettingCurve; falls back to
 * deprecated `fsrs().retrievability` with a legacy-shaped card (FSRS-6).
 */
export function retrievability(
  card: FsrsSchedulerCard,
  now: Date = new Date(),
  modelVersion: "FSRS-6" | "FSRS-7" = "FSRS-6",
): number | null {
  if (card.state === State.New || card.lastReviewAt == null) return null;
  try {
    const elapsedDays = Math.max(
      0,
      Math.floor((now.getTime() - card.lastReviewAt.getTime()) / 86_400_000),
    );
    const model = modelVersion === "FSRS-7" ? rModel7 : rModel6;
    if (model) {
      const memory =
        modelVersion === "FSRS-7"
          ? {
              stability: card.stability,
              difficulty: card.difficulty,
              stabilityFast: card.stabilityFast ?? card.stability,
            }
          : { stability: card.stability, difficulty: card.difficulty };
      const r = model.forgettingCurve(memory as never, elapsedDays);
      if (typeof r !== "number" || Number.isNaN(r)) return null;
      return r;
    }
    // Sync fallback until models are warmed (FSRS-6 legacy facade).
    const r = fsrs().retrievability(
      {
        due: card.dueAt,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: elapsedDays,
        scheduled_days: card.scheduledDays,
        learning_steps: card.learningStep,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state as never,
        last_review: card.lastReviewAt,
      } as never,
      now,
    );
    if (typeof r !== "number" || Number.isNaN(r)) return null;
    return r;
  } catch {
    return null;
  }
}

function toIso(value: Date | string | undefined | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Map a scheduler card into schedule column values (snake_case storage). */
export function scheduleColumnsFromCard(card: FsrsSchedulerCard): {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
  stability_fast: number | null;
} {
  const due = toIso(card.dueAt);
  if (!due) throw new Error("FSRS card missing dueAt");
  let elapsedDays = 0;
  if (card.lastReviewAt) {
    elapsedDays = Math.max(
      0,
      Math.floor(
        (card.dueAt.getTime() - card.lastReviewAt.getTime()) / 86_400_000,
      ),
    );
  }
  return {
    due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningStep,
    reps: card.reps,
    lapses: card.lapses,
    state: Number(card.state),
    last_review: toIso(card.lastReviewAt),
    stability_fast:
      card.stabilityFast != null && Number.isFinite(card.stabilityFast)
        ? card.stabilityFast
        : null,
  };
}
