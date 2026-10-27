import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { newCard, scheduleColumnsFromCard } from "../study/fsrs";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

const MAX_IMPORT_CARDS = 200;

type ImportDeck = { clientId: string; title: string };
type ImportCard = { clientDeckId: string; front: string; back: string };

function foldDeckTitle(title: string): string {
  return title.trim().normalize("NFC").toLowerCase();
}

function parseImportBody(raw: unknown): {
  decks: ImportDeck[];
  cards: ImportCard[];
} {
  if (raw == null || typeof raw !== "object") {
    throw new HTTPException(400, { message: "Invalid body" });
  }
  const body = raw as Record<string, unknown>;
  if (!Array.isArray(body.decks) || !Array.isArray(body.cards)) {
    throw new HTTPException(400, { message: "Invalid body" });
  }

  const decks: ImportDeck[] = [];
  for (const item of body.decks) {
    if (item == null || typeof item !== "object") {
      throw new HTTPException(400, { message: "Invalid deck" });
    }
    const d = item as Record<string, unknown>;
    if (typeof d.clientId !== "string" || !d.clientId) {
      throw new HTTPException(400, { message: "Invalid deck" });
    }
    if (typeof d.title !== "string") {
      throw new HTTPException(400, { message: "Invalid deck" });
    }
    decks.push({ clientId: d.clientId, title: d.title.trim() || "Untitled" });
  }

  const cards: ImportCard[] = [];
  for (const item of body.cards) {
    if (item == null || typeof item !== "object") {
      throw new HTTPException(400, { message: "Invalid card" });
    }
    const c = item as Record<string, unknown>;
    if (typeof c.clientDeckId !== "string" || !c.clientDeckId) {
      throw new HTTPException(400, { message: "Invalid card" });
    }
    if (typeof c.front !== "string" || typeof c.back !== "string") {
      throw new HTTPException(400, { message: "Invalid card" });
    }
    cards.push({
      clientDeckId: c.clientDeckId,
      front: c.front,
      back: c.back,
    });
  }

  return { decks, cards };
}

export const guestRoutes = new Hono<AppEnv>();

guestRoutes.post("/import", async (c) => {
  const userId = await requireUser(c);

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const { decks, cards } = parseImportBody(raw);

  if (cards.length > MAX_IMPORT_CARDS) {
    throw new HTTPException(400, {
      message: `At most ${MAX_IMPORT_CARDS} cards`,
    });
  }

  const clientIds = new Set(decks.map((d) => d.clientId));
  if (clientIds.size !== decks.length) {
    throw new HTTPException(400, { message: "Duplicate clientId" });
  }
  for (const card of cards) {
    if (!clientIds.has(card.clientDeckId)) {
      throw new HTTPException(400, { message: "Unknown clientDeckId" });
    }
  }

  if (decks.length === 0 && cards.length === 0) {
    return c.json({ deckCount: 0, cardCount: 0 });
  }

  const db = getDb(c.env);
  const now = new Date().toISOString();
  const clientToServer = new Map<string, string>();
  const statements: D1PreparedStatement[] = [];

  const { results: existingDecks } = await db
    .prepare(
      "SELECT id, title, created_at FROM decks WHERE user_id = ? ORDER BY created_at ASC, id ASC",
    )
    .bind(userId)
    .all<{ id: string; title: string; created_at: string }>();

  const byFold = new Map<string, string>();
  for (const deck of existingDecks ?? []) {
    const key = foldDeckTitle(deck.title);
    if (!byFold.has(key)) byFold.set(key, deck.id);
  }

  const misses = decks.filter((d) => !byFold.has(foldDeckTitle(d.title)));
  let unfiledId: string | null = null;
  if (misses.length > 0) {
    const row = await db
      .prepare(
        "SELECT id FROM subjects WHERE user_id = ? AND title = ? ORDER BY created_at ASC, id ASC LIMIT 1",
      )
      .bind(userId, "Unfiled")
      .first<{ id: string }>();
    if (row) {
      unfiledId = row.id;
    } else {
      unfiledId = crypto.randomUUID();
      statements.push(
        db
          .prepare(
            "INSERT INTO subjects (id, user_id, title, created_at) VALUES (?, ?, ?, ?)",
          )
          .bind(unfiledId, userId, "Unfiled", now),
      );
    }
  }

  for (const deck of decks) {
    const key = foldDeckTitle(deck.title);
    const hit = byFold.get(key);
    if (hit) {
      clientToServer.set(deck.clientId, hit);
      continue;
    }
    const id = crypto.randomUUID();
    byFold.set(key, id);
    clientToServer.set(deck.clientId, id);
    statements.push(
      db
        .prepare(
          "INSERT INTO decks (id, user_id, title, subject_hint, subject_id, created_at) VALUES (?, ?, ?, NULL, ?, ?)",
        )
        .bind(id, userId, deck.title, unfiledId!, now),
    );
  }

  const provenance = JSON.stringify({ guest_import: true, source: "paste" });

  for (const card of cards) {
    const deckId = clientToServer.get(card.clientDeckId);
    if (!deckId) {
      throw new HTTPException(400, { message: "Unknown clientDeckId" });
    }
    const cardId = crypto.randomUUID();
    const schedule = scheduleColumnsFromCard(newCard());
    statements.push(
      db
        .prepare(
          `INSERT INTO cards (
            id, deck_id, job_id, type, front_json, back_json,
            media_r2_keys_json, provenance_json, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          cardId,
          deckId,
          null,
          "qa",
          JSON.stringify(card.front),
          JSON.stringify(card.back),
          null,
          provenance,
          "accepted",
          now,
          now,
        ),
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO card_schedules (
            card_id, due, stability, difficulty, elapsed_days, scheduled_days,
            learning_steps, reps, lapses, state, last_review
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          cardId,
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
        ),
    );
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return c.json({ deckCount: decks.length, cardCount: cards.length });
});
