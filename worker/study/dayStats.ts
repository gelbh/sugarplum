/** Load intros already counted for a local calendar day (YYYY-MM-DD). */
export async function loadIntrosUsedToday(
  db: D1Database,
  userId: string,
  day: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT intros_used FROM user_study_day WHERE user_id = ? AND day = ?`,
    )
    .bind(userId, day)
    .first<{ intros_used: number }>();
  return row ? Number(row.intros_used) || 0 : 0;
}

/** Increment intros_used for the day (first review of a New card). */
export async function incrementIntrosUsedToday(
  db: D1Database,
  userId: string,
  day: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO user_study_day (user_id, day, intros_used)
       VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET
         intros_used = intros_used + 1`,
    )
    .bind(userId, day)
    .run();
}
