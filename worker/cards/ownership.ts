import { HTTPException } from "hono/http-exception";
import { assertValidMcqOptions } from "../generation/schema";
import { newCard, scheduleColumnsFromCard } from "../study/fsrs";
import { type CardRow, decodeStoredBack } from "./serialize";

export async function requireOwnedCard(
  db: D1Database,
  cardId: string,
  userId: string,
): Promise<CardRow> {
  const row = await db
    .prepare(
      `SELECT c.id, c.deck_id, c.job_id, c.type, c.front_json, c.back_json,
              c.media_r2_keys_json, c.provenance_json, c.status, c.created_at, c.updated_at
       FROM cards c
       INNER JOIN decks d ON d.id = c.deck_id
       WHERE c.id = ? AND d.user_id = ?`,
    )
    .bind(cardId, userId)
    .first<CardRow>();
  if (!row) throw new HTTPException(404, { message: "Card not found" });
  return row;
}

/** Reject draft cards on other owned needs_review jobs (any deck). */
export async function rejectOwnedSiblingDrafts(
  db: D1Database,
  args: { userId: string; excludeJobId: string },
): Promise<number> {
  const updatedAt = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE cards SET status = ?, updated_at = ?
       WHERE status = ?
         AND job_id IN (
           SELECT j.id FROM generation_jobs j
           INNER JOIN materials m ON m.id = j.material_id
           INNER JOIN decks d ON d.id = m.deck_id
           WHERE d.user_id = ? AND j.status = ? AND j.id != ?
         )`,
    )
    .bind(
      "rejected",
      updatedAt,
      "draft",
      args.userId,
      "needs_review",
      args.excludeJobId,
    )
    .run();
  return result.meta.changes ?? 0;
}

export async function acceptDraftCard(
  db: D1Database,
  card: { id: string; type: string; back_json: string; status: string },
): Promise<"accepted" | "conflict" | "invalid"> {
  if (card.status !== "draft") return "conflict";
  if (card.type === "mcq") {
    const decoded = decodeStoredBack(card.type, card.back_json);
    try {
      assertValidMcqOptions(decoded.back, decoded.options);
    } catch {
      return "invalid";
    }
  }

  const schedule = scheduleColumnsFromCard(newCard());
  const updatedAt = new Date().toISOString();
  // One batch: CAS update + schedule insert only when this accept won
  // (INSERT…SELECT matches the new accepted row). CAS miss inserts 0 rows;
  // INSERT failure rolls the batch back on D1 so status is not stranded.
  const results = await db.batch([
    db
      .prepare(
        `UPDATE cards SET status = ?, updated_at = ? WHERE id = ? AND status = ?`,
      )
      .bind("accepted", updatedAt, card.id, "draft"),
    db
      .prepare(
        `INSERT INTO card_schedules (
           card_id, due, stability, difficulty, elapsed_days, scheduled_days,
           learning_steps, reps, lapses, state, last_review
         )
         SELECT c.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         FROM cards c
         WHERE c.id = ? AND c.status = ? AND c.updated_at = ?`,
      )
      .bind(
        schedule.due,
        schedule.stability,
        schedule.difficulty,
        schedule.elapsed_days,
        schedule.scheduled_days,
        schedule.learning_steps,
        schedule.reps,
        schedule.lapses,
        schedule.state,
        schedule.last_review,
        card.id,
        "accepted",
        updatedAt,
      ),
  ]);
  if (!results[0]?.meta.changes) return "conflict";
  return "accepted";
}

/** Undo a single accept or reject: return the card to draft for review. */
export async function undoReviewDecision(
  db: D1Database,
  card: { id: string; status: string },
): Promise<"draft" | "conflict" | "unsupported"> {
  if (card.status !== "accepted" && card.status !== "rejected") {
    return "unsupported";
  }

  const updatedAt = new Date().toISOString();
  if (card.status === "rejected") {
    const result = await db
      .prepare(
        `UPDATE cards SET status = ?, reject_reason = ?, updated_at = ?
         WHERE id = ? AND status = ?`,
      )
      .bind("draft", null, updatedAt, card.id, "rejected")
      .run();
    return result.meta.changes ? "draft" : "conflict";
  }

  const results = await db.batch([
    db
      .prepare(
        `UPDATE cards SET status = ?, updated_at = ? WHERE id = ? AND status = ?`,
      )
      .bind("draft", updatedAt, card.id, "accepted"),
    db.prepare(`DELETE FROM card_schedules WHERE card_id = ?`).bind(card.id),
  ]);
  return results[0]?.meta.changes ? "draft" : "conflict";
}
