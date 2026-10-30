import { levelFromXp } from "./constants";

export async function ensureUserGamification(
  db: D1Database,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO user_gamification (
         user_id, streak_current, streak_best, streak_day,
         xp_total, level, display_name, board_opt_in, updated_at, catalog_version
       ) VALUES (
         ?, 0, 0, NULL, 0, 1, NULL, 0, ?,
         (SELECT COALESCE(MAX(catalog_version), 1) FROM achievement_defs WHERE active = 1)
       )`,
    )
    .bind(userId, now)
    .run();
}

/** Ledger rows with `keyPrefix` in [start, end] may not sum past `max`. */
export type XpCap = {
  keyPrefix: string;
  start: string;
  end: string;
  max: number;
};

export async function creditXp(
  db: D1Database,
  userId: string,
  amount: number,
  reason: string,
  idempotencyKey: string,
  cap?: XpCap,
): Promise<{ awarded: boolean; xpTotal: number; level: number }> {
  await ensureUserGamification(db, userId);

  const ledgerId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const values = [ledgerId, userId, amount, reason, idempotencyKey, createdAt];

  // One statement, so concurrent credits cannot both pass the cap check.
  const insert = cap
    ? await db
        .prepare(
          `INSERT OR IGNORE INTO xp_ledger (
             id, user_id, amount, reason, idempotency_key, created_at
           )
           SELECT ?1, ?2, ?3, ?4, ?5, ?6
           WHERE (
             SELECT COALESCE(SUM(amount), 0) FROM xp_ledger
             WHERE user_id = ?2
               AND idempotency_key LIKE ?7
               AND created_at >= ?8
               AND created_at <= ?9
           ) + ?3 <= ?10`,
        )
        .bind(...values, `${cap.keyPrefix}%`, cap.start, cap.end, cap.max)
        .run()
    : await db
        .prepare(
          `INSERT OR IGNORE INTO xp_ledger (
             id, user_id, amount, reason, idempotency_key, created_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(...values)
        .run();

  if ((insert.meta.changes ?? 0) === 0) {
    const row = await db
      .prepare(
        `SELECT xp_total, level FROM user_gamification WHERE user_id = ?`,
      )
      .bind(userId)
      .first<{ xp_total: number; level: number }>();
    return {
      awarded: false,
      xpTotal: row?.xp_total ?? 0,
      level: row?.level ?? 1,
    };
  }

  await db
    .prepare(
      `UPDATE user_gamification
       SET xp_total = xp_total + ?, updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(amount, createdAt, userId)
    .run();

  const current = await db
    .prepare(`SELECT xp_total FROM user_gamification WHERE user_id = ?`)
    .bind(userId)
    .first<{ xp_total: number }>();
  const xpTotal = current?.xp_total ?? amount;
  const level = levelFromXp(xpTotal);

  await db
    .prepare(
      `UPDATE user_gamification SET level = ?, updated_at = ? WHERE user_id = ?`,
    )
    .bind(level, createdAt, userId)
    .run();

  return { awarded: true, xpTotal, level };
}
