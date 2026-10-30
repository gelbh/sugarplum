import type { UnlockView } from "../../src/achievements/wire";
import { utcDay, XP } from "./constants";
import { evaluateAfterAccept, evaluateAfterReview } from "./evaluate";
import { applyStudyDayStreak } from "./streak";
import { creditXp } from "./xp";

function utcDayBounds(day: string): { start: string; end: string } {
  return {
    start: `${day}T00:00:00.000Z`,
    end: `${day}T23:59:59.999Z`,
  };
}

async function reviewXpToday(
  db: D1Database,
  userId: string,
  day: string,
): Promise<number> {
  const { start, end } = utcDayBounds(day);
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM xp_ledger
       WHERE user_id = ?
         AND idempotency_key LIKE 'review:%'
         AND created_at >= ?
         AND created_at <= ?`,
    )
    .bind(userId, start, end)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
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

  const todayReviewXp = await reviewXpToday(db, userId, day);
  if (todayReviewXp + XP.perReview <= XP.reviewDailyCap) {
    await creditXp(
      db,
      userId,
      XP.perReview,
      "review",
      `review:${reviewLogId}`,
    );
  }
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
