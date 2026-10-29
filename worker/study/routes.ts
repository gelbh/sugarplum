import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { serializeCard, type CardRow } from "../cards/routes";
import { requireOwnedDeck } from "../materials/routes";
import {
  Rating,
  cardFromScheduleRow,
  retrievability,
  reviewWithLog,
  scheduleColumnsFromCard,
  type ScheduleRowLike,
} from "./fsrs";
import { resolveLocalDayStartIso } from "../../src/study/localDay";
import { loadStudyPrefs } from "./prefs";
import {
  buildStudyQueue,
  type QueueCandidate,
  type StudyPrefs,
} from "./queue";
import { rankWeakness, type WeaknessCandidate } from "./weakness";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

type DueSqlRow = CardRow &
  ScheduleRowLike & {
    due: string;
  };

type StrugglingSqlRow = {
  id: string;
  deck_id: string;
  front_json: string;
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
  again_14d: number;
  hard_14d: number;
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

export { resolveLocalDayStartIso };

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
 * Drafts never appear here.
 * Optional mutually exclusive deckId or subjectId scopes the queue; omit both = global.
 * Response: `{ cards, meta }` (breaking vs bare array).
 */
studyRoutes.get("/due", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const now = new Date();
  const nowIso = now.toISOString();
  const deckId = c.req.query("deckId")?.trim() || null;
  const subjectId = c.req.query("subjectId")?.trim() || null;
  const localDay = c.req.query("localDay")?.trim() || null;
  const tzOffsetMinutes = parseFiniteNumber(c.req.query("tzOffsetMinutes"));
  const introBonusRaw = parseNonnegInt(c.req.query("introBonus"));

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

  let sql = `SELECT c.id, c.deck_id, c.job_id, c.type, c.front_json, c.back_json,
              c.media_r2_keys_json, c.provenance_json, c.status, c.created_at, c.updated_at,
              s.due, s.stability, s.difficulty, s.elapsed_days, s.scheduled_days,
              s.learning_steps, s.reps, s.lapses, s.state, s.last_review
       FROM cards c
       INNER JOIN card_schedules s ON s.card_id = c.id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = ? AND s.due <= ?`;
  const binds: unknown[] = [userId, "accepted", nowIso];

  if (deckId) {
    sql += " AND c.deck_id = ?";
    binds.push(deckId);
  } else if (subjectId) {
    sql += " AND d.subject_id = ?";
    binds.push(subjectId);
  }

  sql += " ORDER BY s.due ASC";

  const { results } = await db.prepare(sql).bind(...binds).all<DueSqlRow>();
  const rows = results ?? [];

  const prefsBase = await loadStudyPrefs(db, userId);
  const prefs: StudyPrefs = {
    ...prefsBase,
    introBonusSlices: introBonusRaw ?? 0,
  };
  const localDayStartIso = resolveLocalDayStartIso(now, {
    localDay,
    tzOffsetMinutes,
  });

  const candidates: QueueCandidate[] = rows.map((row) => ({
    id: row.id,
    due: row.due,
    state: row.state,
    reps: row.reps,
    last_review: row.last_review,
    lapses: row.lapses,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
  }));

  const queue = buildStudyQueue(candidates, prefs, now, localDayStartIso);

  if (queue.deferrals.length > 0) {
    const stmts = queue.deferrals.map((d) =>
      db
        .prepare("UPDATE card_schedules SET due = ? WHERE card_id = ?")
        .bind(d.newDue, d.id),
    );
    await db.batch(stmts);
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const cards = queue.selected.map((c) => {
    const row = byId.get(c.id)!;
    return {
      ...serializeCard(row),
      due: row.due,
    };
  });

  return c.json({ cards, meta: queue.meta });
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
  const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { results } = await db
    .prepare(
      `SELECT c.id, c.deck_id, c.front_json,
              s.lapses, s.difficulty, s.due, s.last_review,
              s.stability, s.elapsed_days, s.scheduled_days, s.learning_steps,
              s.reps, s.state,
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

  const candidates: WeaknessCandidate[] = (results ?? []).map((row) => {
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
        }),
        now,
      );
    } catch {
      r = null;
    }
    return {
      id: row.id,
      deck_id: row.deck_id,
      front_json: row.front_json,
      lapses: row.lapses,
      again_14d,
      hard_14d,
      difficulty: row.difficulty,
      due: row.due,
      last_review: row.last_review,
      retrievability: r,
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
