import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { State } from "ts-fsrs";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { type CardRow } from "../cards/routes";
import { requireOwnedDeck } from "../materials/routes";
import {
  cardFromScheduleRow,
  retrievability,
  reviewWithLog,
  scheduleColumnsFromCard,
  type ScheduleRowLike,
} from "./fsrs";
import { resolveLocalDayStartIso } from "../../src/study/localDay";
import { incrementIntrosUsedToday } from "./dayStats";
import {
  applyDeferrals,
  buildDueQueueForUser,
  serializeDueCards,
} from "./dueQueue";
import { rankWeakness } from "./weakness";
import {
  cardHasRegenSource,
  parseProvenanceJson,
} from "../../src/study/regenSource";
import { onReviewGraded } from "../gamification/onStudyEvent";
import { applyLoadBalance } from "../../src/study/loadBalance";
import { loadDueHistogram } from "./dueHistogram";
import { loadStudyPrefs } from "./prefs";
import {
  prepareFullScheduleUpdate,
  ratingToGrade,
} from "./scheduleWrite";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

type StrugglingSqlRow = {
  id: string;
  deck_id: string;
  job_id: string | null;
  type: string;
  front_json: string;
  provenance_json: string | null;
  lapses: number;
  difficulty: number;
  due: string;
  last_review: string | null;
  stability: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  state: number;
  stability_fast: number | null;
  again_14d: number;
  hard_14d: number;
};

const ReviewBodySchema = z.object({
  cardId: z.string().min(1),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  /** Client local calendar day for intro day-ledger (YYYY-MM-DD). */
  localDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** JS getTimezoneOffset-style minutes for easy-day weekday math. */
  tzOffsetMinutes: z.number().finite().optional(),
});

export { resolveLocalDayStartIso };

async function assertDueScope(
  db: D1Database,
  userId: string,
  deckId: string | null,
  subjectId: string | null,
): Promise<void> {
  if (deckId && subjectId) {
    throw new HTTPException(400, {
      message: "deckId and subjectId are mutually exclusive",
    });
  }
  if (deckId) {
    await requireOwnedDeck(db, deckId, userId);
  } else if (subjectId) {
    const subject = await db
      .prepare("SELECT id FROM subjects WHERE id = ? AND user_id = ?")
      .bind(subjectId, userId)
      .first<{ id: string }>();
    if (!subject) {
      throw new HTTPException(404, { message: "Subject not found" });
    }
  }
}

function parseNonnegInt(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function parseFiniteNumber(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

export const studyRoutes = new Hono<AppEnv>();

/**
 * Cards ready for study: accepted + schedule due <= now, then policy queue.
 * Does NOT mutate schedules (deferrals are preview-only until POST commit-pacing).
 * Response: `{ cards, meta, pendingDeferrals }`.
 */
studyRoutes.get("/due", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const now = new Date();
  const deckId = c.req.query("deckId")?.trim() || null;
  const subjectId = c.req.query("subjectId")?.trim() || null;
  const localDay = c.req.query("localDay")?.trim() || null;
  const introBonusRaw = parseNonnegInt(c.req.query("introBonus"));
  // tzOffsetMinutes accepted for display compatibility; overdue uses server UTC.
  void parseFiniteNumber(c.req.query("tzOffsetMinutes"));

  await assertDueScope(db, userId, deckId, subjectId);

  const { rows, queue } = await buildDueQueueForUser(
    db,
    userId,
    now,
    { deckId, subjectId },
    introBonusRaw ?? 0,
    localDay,
  );

  return c.json({
    cards: serializeDueCards(
      rows,
      queue.selected.map((s) => s.id),
    ),
    meta: queue.meta,
    pendingDeferrals: queue.deferrals,
  });
});

/**
 * Apply R-aware review deferrals for today's over-budget cards.
 * Overdue boundary uses server UTC day (not client localDay).
 */
studyRoutes.post("/commit-pacing", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const now = new Date();
  const deckId = c.req.query("deckId")?.trim() || null;
  const subjectId = c.req.query("subjectId")?.trim() || null;
  const localDay = c.req.query("localDay")?.trim() || null;
  const introBonusRaw = parseNonnegInt(c.req.query("introBonus"));

  await assertDueScope(db, userId, deckId, subjectId);

  const { queue } = await buildDueQueueForUser(
    db,
    userId,
    now,
    { deckId, subjectId },
    introBonusRaw ?? 0,
    localDay,
  );

  await applyDeferrals(db, userId, queue.deferrals);
  return c.json({ deferredCount: queue.deferrals.length });
});

/**
 * Accepted cards ranked by weakness score (Again/Hard/lapses/R); capped at 50.
 * Drafts never appear. Ownership mirrors /due via decks.user_id.
 */
studyRoutes.get("/struggling", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const now = new Date();
  const nowIso = now.toISOString();
  const since = new Date(
    now.getTime() - 14 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { results } = await db
    .prepare(
      `SELECT c.id, c.deck_id, c.job_id, c.type, c.front_json, c.provenance_json,
              s.lapses, s.difficulty, s.due, s.last_review,
              s.stability, s.elapsed_days, s.scheduled_days, s.learning_steps,
              s.reps, s.state, s.stability_fast,
              (
                SELECT COUNT(*) FROM review_logs rl
                WHERE rl.card_id = c.id
                  AND rl.rating = 1
                  AND rl.reviewed_at >= ?
              ) AS again_14d,
              (
                SELECT COUNT(*) FROM review_logs rl
                WHERE rl.card_id = c.id
                  AND rl.rating = 2
                  AND rl.reviewed_at >= ?
              ) AS hard_14d
       FROM cards c
       INNER JOIN card_schedules s ON s.card_id = c.id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = ?`,
    )
    .bind(since, since, userId, "accepted")
    .all<StrugglingSqlRow>();

  const candidates = (results ?? []).map((row) => {
    const again_14d = Number(row.again_14d) || 0;
    const hard_14d = Number(row.hard_14d) || 0;
    let r: number | null = null;
    try {
      r = retrievability(
        cardFromScheduleRow({
          due: row.due,
          stability: row.stability,
          difficulty: row.difficulty,
          elapsed_days: row.elapsed_days,
          scheduled_days: row.scheduled_days,
          learning_steps: row.learning_steps,
          reps: row.reps,
          lapses: row.lapses,
          state: row.state,
          last_review: row.last_review,
          stability_fast: row.stability_fast,
        }),
        now,
      );
    } catch {
      r = null;
    }
    return {
      id: row.id,
      deck_id: row.deck_id,
      type: row.type,
      front_json: row.front_json,
      lapses: row.lapses,
      again_14d,
      hard_14d,
      difficulty: row.difficulty,
      due: row.due,
      last_review: row.last_review,
      retrievability: r,
      has_regen_source: cardHasRegenSource({
        job_id: row.job_id,
        provenance: parseProvenanceJson(row.provenance_json),
      }),
    };
  });

  return c.json(rankWeakness(candidates, nowIso));
});

/** Grade a due accepted card with FSRS; writes review_logs and updates schedule. */
studyRoutes.post("/review", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const parsed = ReviewBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "cardId and rating (1-4) required",
    });
  }

  const { cardId, rating, localDay, tzOffsetMinutes: tzRaw } = parsed.data;
  const now = new Date();
  const tzOffsetMinutes =
    typeof tzRaw === "number" && Number.isFinite(tzRaw) ? tzRaw : 0;

  const card = await db
    .prepare(
      `SELECT c.id, c.deck_id, c.job_id, c.type, c.front_json, c.back_json,
              c.media_r2_keys_json, c.provenance_json, c.status, c.created_at, c.updated_at
       FROM cards c
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE c.id = ? AND d.user_id = ?`,
    )
    .bind(cardId, userId)
    .first<CardRow>();

  if (!card) throw new HTTPException(404, { message: "Card not found" });
  if (card.status !== "accepted") {
    throw new HTTPException(400, {
      message: "Only accepted cards can be reviewed",
    });
  }

  const schedule = await db
    .prepare(
      `SELECT due, stability, difficulty, elapsed_days, scheduled_days,
              learning_steps, reps, lapses, state, last_review, stability_fast
       FROM card_schedules WHERE card_id = ?`,
    )
    .bind(cardId)
    .first<ScheduleRowLike>();

  if (!schedule) {
    throw new HTTPException(400, { message: "Card has no schedule" });
  }

  const wasNew =
    schedule.state === State.New ||
    (schedule.reps === 0 && schedule.last_review == null);

  const grade = ratingToGrade(rating);
  if (grade == null) {
    throw new HTTPException(400, {
      message: "cardId and rating (1-4) required",
    });
  }
  const prefs = await loadStudyPrefs(db, userId);
  const useLoadBalance = prefs.enableLoadBalance && prefs.enableFuzz;

  // When load balance is on, schedule the ideal interval (fuzz off) then pick
  // within the fuzz window so we do not double-fuzz.
  const { card: gradedCard, log } = await reviewWithLog(
    cardFromScheduleRow({ ...schedule, card_id: cardId }),
    grade,
    now,
    {
      desiredRetention: prefs.desiredRetention,
      enableFuzz: useLoadBalance ? false : prefs.enableFuzz,
      w: prefs.w,
    },
  );

  let nextCard = gradedCard;
  if (useLoadBalance) {
    const hist = await loadDueHistogram(
      db,
      userId,
      now,
      tzOffsetMinutes,
      localDay,
    );
    nextCard = applyLoadBalance(gradedCard, {
      enableLoadBalance: true,
      enableFuzz: true,
      easyDays: prefs.easyDays,
      now,
      tzOffsetMinutes,
      dueCntPerDay: hist.dueCntPerDay,
      dueToday: hist.dueToday,
      reviewedToday: hist.reviewedToday,
    });
  }

  const cols = scheduleColumnsFromCard(nextCard);
  const reviewedAt = toIsoRequired(log.review ?? now);
  const reviewLogId = crypto.randomUUID();
  const logScheduledDays = cols.scheduled_days;
  const logForPersist = {
    ...log,
    scheduled_days: logScheduledDays,
    due: nextCard.dueAt,
  };

  await db.batch([
    prepareFullScheduleUpdate(
      db,
      {
        due: cols.due,
        stability: cols.stability,
        difficulty: cols.difficulty,
        elapsed_days: cols.elapsed_days,
        scheduled_days: cols.scheduled_days,
        learning_steps: cols.learning_steps,
        reps: cols.reps,
        lapses: cols.lapses,
        state: cols.state,
        last_review: cols.last_review,
        stability_fast: cols.stability_fast,
      },
      cardId,
      userId,
    ),
    db
      .prepare(
        `INSERT INTO review_logs (
           id, card_id, rating, scheduled_days, elapsed_days, reviewed_at, state_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reviewLogId,
        cardId,
        rating,
        logScheduledDays,
        log.elapsed_days,
        reviewedAt,
        JSON.stringify(logForPersist),
      ),
  ]);

  if (wasNew) {
    const day =
      localDay ??
      (() => {
        const y = now.getUTCFullYear();
        const m = String(now.getUTCMonth() + 1).padStart(2, "0");
        const d = String(now.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      })();
    await incrementIntrosUsedToday(db, userId, day);
  }

  const unlocks = await onReviewGraded(db, userId, {
    reviewLogId,
    reviewedAt: new Date(reviewedAt),
  });

  return c.json({ due: cols.due, state: cols.state, unlocks });
});

function toIsoRequired(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
