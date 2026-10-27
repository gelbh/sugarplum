import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { serializeCard, type CardRow } from "../cards/routes";
import {
  Rating,
  cardFromScheduleRow,
  reviewWithLog,
  scheduleColumnsFromCard,
  type ScheduleRowLike,
} from "./fsrs";
import { rankStruggling, type StrugglingCandidate } from "./struggling";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

type DueRow = CardRow & { due: string };

type StrugglingSqlRow = {
  id: string;
  deck_id: string;
  front_json: string;
  lapses: number;
  difficulty: number;
  due: string;
  last_review: string | null;
  again_14d: number;
};

const ReviewBodySchema = z.object({
  cardId: z.string().min(1),
  rating: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
});

export const studyRoutes = new Hono<AppEnv>();

/**
 * Cards ready for study: accepted + schedule due <= now.
 * Drafts never appear here.
 */
studyRoutes.get("/due", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const now = new Date().toISOString();

  const { results } = await db
    .prepare(
      `SELECT c.id, c.deck_id, c.job_id, c.type, c.front_json, c.back_json,
              c.media_r2_keys_json, c.provenance_json, c.status, c.created_at, c.updated_at,
              s.due
       FROM cards c
       INNER JOIN card_schedules s ON s.card_id = c.id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = ? AND s.due <= ?
       ORDER BY s.due ASC`,
    )
    .bind(userId, "accepted", now)
    .all<DueRow>();

  return c.json(
    (results ?? []).map((row) => ({
      ...serializeCard(row),
      due: row.due,
    })),
  );
});

/**
 * Accepted cards struggling by lapses or recent Again; ranked, capped at 50.
 * Drafts never appear. Ownership mirrors /due via decks.user_id.
 */
studyRoutes.get("/struggling", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const now = new Date();
  const nowIso = now.toISOString();
  const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { results } = await db
    .prepare(
      `SELECT c.id, c.deck_id, c.front_json,
              s.lapses, s.difficulty, s.due, s.last_review,
              (
                SELECT COUNT(*) FROM review_logs rl
                WHERE rl.card_id = c.id
                  AND rl.rating = 1
                  AND rl.reviewed_at >= ?
              ) AS again_14d
       FROM cards c
       INNER JOIN card_schedules s ON s.card_id = c.id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = ?`,
    )
    .bind(since, userId, "accepted")
    .all<StrugglingSqlRow>();

  const candidates: StrugglingCandidate[] = (results ?? []).map((row) => ({
    id: row.id,
    deck_id: row.deck_id,
    front_json: row.front_json,
    lapses: row.lapses,
    again_14d: Number(row.again_14d) || 0,
    difficulty: row.difficulty,
    due: row.due,
    last_review: row.last_review,
  }));

  return c.json(rankStruggling(candidates, nowIso));
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

  const { cardId, rating } = parsed.data;
  const now = new Date();

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
              learning_steps, reps, lapses, state, last_review
       FROM card_schedules WHERE card_id = ?`,
    )
    .bind(cardId)
    .first<ScheduleRowLike>();

  if (!schedule) {
    throw new HTTPException(400, { message: "Card has no schedule" });
  }

  const grade = ratingToGrade(rating);

  const { card: nextCard, log } = reviewWithLog(
    cardFromScheduleRow(schedule),
    grade,
    now,
  );
  const cols = scheduleColumnsFromCard(nextCard);
  const reviewedAt = toIsoRequired(log.review ?? now);

  await db.batch([
    db
      .prepare(
        `UPDATE card_schedules SET
           due = ?, stability = ?, difficulty = ?, elapsed_days = ?,
           scheduled_days = ?, learning_steps = ?, reps = ?, lapses = ?,
           state = ?, last_review = ?
         WHERE card_id = ?`,
      )
      .bind(
        cols.due,
        cols.stability,
        cols.difficulty,
        cols.elapsed_days,
        cols.scheduled_days,
        cols.learning_steps,
        cols.reps,
        cols.lapses,
        cols.state,
        cols.last_review,
        cardId,
      ),
    db
      .prepare(
        `INSERT INTO review_logs (
           id, card_id, rating, scheduled_days, elapsed_days, reviewed_at, state_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        cardId,
        rating,
        log.scheduled_days,
        log.elapsed_days,
        reviewedAt,
        JSON.stringify(log),
      ),
  ]);

  return c.json({ due: cols.due });
});

function toIsoRequired(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function ratingToGrade(
  rating: 1 | 2 | 3 | 4,
): typeof Rating.Again | typeof Rating.Hard | typeof Rating.Good | typeof Rating.Easy {
  switch (rating) {
    case 1:
      return Rating.Again;
    case 2:
      return Rating.Hard;
    case 3:
      return Rating.Good;
    case 4:
      return Rating.Easy;
    default: {
      const _exhaustive: never = rating;
      return _exhaustive;
    }
  }
}
