import { HTTPException } from "hono/http-exception";
import type { DeckRow, MaterialRow } from "./types";

export async function requireOwnedDeck(
  db: D1Database,
  deckId: string,
  userId: string,
): Promise<DeckRow> {
  const deck = await db
    .prepare(
      "SELECT id, user_id, title, subject_hint, subject_id, created_at FROM decks WHERE id = ? AND user_id = ?",
    )
    .bind(deckId, userId)
    .first<DeckRow>();
  if (!deck) throw new HTTPException(404, { message: "Deck not found" });
  return deck;
}

export async function requireOwnedSubjectId(
  db: D1Database,
  subjectId: string,
  userId: string,
): Promise<void> {
  const subject = await db
    .prepare("SELECT id, user_id FROM subjects WHERE id = ? AND user_id = ?")
    .bind(subjectId, userId)
    .first<{ id: string; user_id: string }>();
  if (!subject) throw new HTTPException(404, { message: "Subject not found" });
}

export function deckJson(deck: {
  id: string;
  title: string;
  subject_hint: string | null;
  subject_id: string | null;
  created_at: string;
}) {
  return {
    id: deck.id,
    title: deck.title,
    subject_hint: deck.subject_hint,
    subject_id: deck.subject_id,
    created_at: deck.created_at,
  };
}

export async function requireOwnedMaterial(
  db: D1Database,
  materialId: string,
  userId: string,
): Promise<MaterialRow> {
  const row = await db
    .prepare(
      `SELECT m.id, m.deck_id, m.kind, m.r2_key, m.filename, m.page_count, m.status, m.created_at, m.source_role
       FROM materials m
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE m.id = ? AND d.user_id = ?`,
    )
    .bind(materialId, userId)
    .first<MaterialRow>();
  if (!row) throw new HTTPException(404, { message: "Material not found" });
  return row;
}

