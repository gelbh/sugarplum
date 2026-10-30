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

/** At most once per UTC day, and only with no accepted card due; the guards make retries idempotent. */
async function bumpClearDueDay(
  db: D1Database,
  userId: string,
  day: string,
  reviewedAt: Date,
): Promise<void> {
  await db
    .prepare(
      `UPDATE user_gamification
       SET clear_due_days = clear_due_days + 1, clear_due_last_day = ?, updated_at = ?
       WHERE user_id = ? AND clear_due_last_day IS NOT ?
         AND NOT EXISTS (
           SELECT 1 FROM cards c
           INNER JOIN card_schedules s ON s.card_id = c.id
           INNER JOIN decks d ON d.id = c.deck_id
           WHERE d.user_id = ? AND c.status = 'accepted' AND s.due <= ?
         )`,
    )
    .bind(
      day,
      new Date().toISOString(),
      userId,
      day,
      userId,
      reviewedAt.toISOString(),
    )
    .run();
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

  await creditXp(db, userId, XP.perReview, "review", `review:${reviewLogId}`, {
    keyPrefix: "review:",
    ...utcDayBounds(day),
    max: XP.reviewDailyCap,
  });
}

export async function onReviewGraded(
  db: D1Database,
  userId: string,
  args: { reviewLogId: string; reviewedAt: Date },
): Promise<UnlockView[]> {
  try {
    const day = utcDay(args.reviewedAt);
    const streak = await applyStudyDayStreak(db, userId, day);
    await bumpClearDueDay(db, userId, day, args.reviewedAt);
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
