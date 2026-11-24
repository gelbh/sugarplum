import { buildDueHistogramFromDues } from "../../src/study/queue/dueHistogram";
import { resolveLocalDayStartIso } from "../../src/study/localDay";

export { buildDueHistogramFromDues };

export type DueHistogram = {
  dueCntPerDay: Map<string, number>;
  dueToday: number;
  reviewedToday: number;
};

/** Load due histogram + reviewed-today for the user's owned accepted cards. */
export async function loadDueHistogram(
  db: D1Database,
  userId: string,
  now: Date,
  tzOffsetMinutes: number,
  localDay: string | null | undefined,
): Promise<DueHistogram> {
  const { results: dueRows } = await db
    .prepare(
      `SELECT s.due AS due
       FROM card_schedules s
       INNER JOIN cards c ON c.id = s.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ? AND c.status = 'accepted'`,
    )
    .bind(userId)
    .all<{ due: string }>();

  const dues = (dueRows ?? []).map((r) => r.due);
  const { dueCntPerDay, dueToday } = buildDueHistogramFromDues(
    dues,
    now,
    tzOffsetMinutes,
  );

  const dayStart = resolveLocalDayStartIso(now, {
    localDay,
    tzOffsetMinutes,
  });
  const dayEnd = new Date(
    new Date(dayStart).getTime() + 86_400_000,
  ).toISOString();

  const reviewed = await db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM review_logs rl
       INNER JOIN cards c ON c.id = rl.card_id
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE d.user_id = ?
         AND rl.reviewed_at >= ?
         AND rl.reviewed_at < ?`,
    )
    .bind(userId, dayStart, dayEnd)
    .first<{ cnt: number }>();

  return {
    dueCntPerDay,
    dueToday,
    reviewedToday: reviewed?.cnt ?? 0,
  };
}
