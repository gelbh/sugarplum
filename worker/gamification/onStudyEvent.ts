import type { UnlockView } from "../../src/achievements/wire";
import { utcDay, XP } from "./constants";
import { evaluateAfterAccept, evaluateAfterReview } from "./evaluate";
import { applyStudyDayStreak } from "./streak";
import { applyXpCredit, creditXp, ensureUserGamification } from "./xp";

function utcDayBounds(day: string): { start: string; end: string } {
  return {
    start: `${day}T00:00:00.000Z`,
    end: `${day}T23:59:59.999Z`,
  };
}

/** One statement, so concurrent reviews cannot overshoot the daily cap. */
async function creditCappedReviewXp(
  db: D1Database,
  userId: string,
  day: string,
  reviewLogId: string,
): Promise<void> {
  await ensureUserGamification(db, userId);
  const { start, end } = utcDayBounds(day);
  const createdAt = new Date().toISOString();
  const insert = await db
    .prepare(
      `INSERT OR IGNORE INTO xp_ledger (
         id, user_id, amount, reason, idempotency_key, created_at
       )
       SELECT ?, ?, ?, ?, ?, ?
       WHERE (
         SELECT COALESCE(SUM(amount), 0) FROM xp_ledger
         WHERE user_id = ?
           AND idempotency_key LIKE 'review:%'
           AND created_at >= ?
           AND created_at <= ?
       ) + ? <= ?`,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      XP.perReview,
      "review",
      `review:${reviewLogId}`,
      createdAt,
      userId,
      start,
      end,
      XP.perReview,
      XP.reviewDailyCap,
    )
    .run();
  if ((insert.meta.changes ?? 0) === 0) return;
  await applyXpCredit(db, userId, XP.perReview, createdAt);
}

async function awardReviewXp(
  db: D1Database,
  userId: string,
  day: string,
  reviewLogId: string,
  isFirstReviewOfDay: boolean,
): Promise<void> {
  if (isFirstReviewOfDay) {
    await creditXp(
      db,
      userId,
      XP.firstStudyDayReview,
      "review_day",
      `review_day:${day}`,
    );
  }

  await creditCappedReviewXp(db, userId, day, reviewLogId);
}

export async function onReviewGraded(
  db: D1Database,
  userId: string,
  args: { reviewLogId: string; reviewedAt: Date },
): Promise<UnlockView[]> {
  try {
    const day = utcDay(args.reviewedAt);
    const streak = await applyStudyDayStreak(db, userId, day);
    await awardReviewXp(
      db,
      userId,
      day,
      args.reviewLogId,
      streak.isFirstReviewOfDay,
    );
    const { unlocks } = await evaluateAfterReview(db, userId, args);
    return unlocks;
  } catch (err) {
    console.error("gamification onReviewGraded", err);
    return [];
  }
}

export async function onCardAccepted(
  db: D1Database,
  userId: string,
  args: { cardId: string; cardType: string },
): Promise<UnlockView[]> {
  return onCardsAccepted(db, userId, [args]);
}

export async function onCardsAccepted(
  db: D1Database,
  userId: string,
  cards: { cardId: string; cardType: string }[],
): Promise<UnlockView[]> {
  if (cards.length === 0) return [];
  try {
    for (const card of cards) {
      await creditXp(
        db,
        userId,
        XP.acceptCard,
        "accept",
        `accept:${card.cardId}`,
      );
    }
    const last = cards[cards.length - 1]!;
    const { unlocks } = await evaluateAfterAccept(db, userId, last);
    return unlocks;
  } catch (err) {
    console.error("gamification onCardsAccepted", err);
    return [];
  }
}
