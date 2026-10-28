import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { newCard, scheduleColumnsFromCard } from "../study/fsrs";
import { assertValidMcqOptions } from "../generation/schema";
import { encodeStoredBack } from "../cards/routes";
import { foldDeckTitle } from "./titleKey";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

const MAX_IMPORT_CARDS = 200;

type ImportSubject = { clientId: string; title: string };
type ImportDeck = { clientId: string; title: string; clientSubjectId: string };
type ImportCardType = "qa" | "cloze" | "mcq";
type ImportSource = "paste" | "hub";

type ImportCard = {
  clientDeckId: string;
  type: ImportCardType;
  front: string;
  back: string;
  options?: string[];
  source: ImportSource;
};

const CARD_TYPES = new Set<ImportCardType>(["qa", "cloze", "mcq"]);
const SOURCES = new Set<ImportSource>(["paste", "hub"]);

function parseImportBody(raw: unknown): {
  subjects: ImportSubject[];
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

  const subjects: ImportSubject[] = [];
  if (body.subjects !== undefined) {
    if (!Array.isArray(body.subjects)) {
      throw new HTTPException(400, { message: "Invalid subjects" });
    }
    for (const item of body.subjects) {
      if (item == null || typeof item !== "object") {
        throw new HTTPException(400, { message: "Invalid subject" });
      }
      const s = item as Record<string, unknown>;
      if (typeof s.clientId !== "string" || !s.clientId) {
        throw new HTTPException(400, { message: "Invalid subject" });
      }
      if (typeof s.title !== "string") {
        throw new HTTPException(400, { message: "Invalid subject" });
      }
      subjects.push({
        clientId: s.clientId,
        title: s.title.trim() || "Untitled",
      });
    }
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
    const clientSubjectId =
      typeof d.clientSubjectId === "string" ? d.clientSubjectId : "";
    decks.push({
      clientId: d.clientId,
      title: d.title.trim() || "Untitled",
      clientSubjectId,
    });
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
    const rawType = c.type === undefined ? "qa" : c.type;
    if (typeof rawType !== "string" || !CARD_TYPES.has(rawType as ImportCardType)) {
      throw new HTTPException(400, { message: "Invalid card type" });
    }
    const type = rawType as ImportCardType;

    let source: ImportSource;
    if (c.source === undefined) {
      source = "paste";
    } else if (typeof c.source !== "string" || !SOURCES.has(c.source as ImportSource)) {
      throw new HTTPException(400, { message: "Invalid card source" });
    } else {
      source = c.source as ImportSource;
    }

    let options: string[] | undefined;
    if (c.options !== undefined) {
      if (!Array.isArray(c.options) || c.options.some((o) => typeof o !== "string")) {
        throw new HTTPException(400, { message: "Invalid card options" });
      }
      options = c.options;
    }

    cards.push({
      clientDeckId: c.clientDeckId,
      type,
      front: c.front,
      back: c.back,
      ...(options !== undefined ? { options } : {}),
      source,
    });
  }

  return { subjects, decks, cards };
}

async function findOrCreateUnfiled(
  db: ReturnType<typeof getDb>,
  userId: string,
  now: string,
  statements: D1PreparedStatement[],
): Promise<string> {
  const row = await db
    .prepare(
      "SELECT id FROM subjects WHERE user_id = ? AND title = ? ORDER BY created_at ASC, id ASC LIMIT 1",
    )
    .bind(userId, "Unfiled")
    .first<{ id: string }>();
  if (row) return row.id;
  const unfiledId = crypto.randomUUID();
  statements.push(
    db
      .prepare(
        "INSERT INTO subjects (id, user_id, title, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(unfiledId, userId, "Unfiled", now),
  );
  return unfiledId;
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

  const { subjects, decks, cards } = parseImportBody(raw);

  if (cards.length > MAX_IMPORT_CARDS) {
    throw new HTTPException(400, {
      message: `At most ${MAX_IMPORT_CARDS} cards`,
    });
  }

  const subjectClientIds = new Set(subjects.map((s) => s.clientId));
  if (subjectClientIds.size !== subjects.length) {
    throw new HTTPException(400, { message: "Duplicate subject clientId" });
  }

  const clientIds = new Set(decks.map((d) => d.clientId));
  if (clientIds.size !== decks.length) {
    throw new HTTPException(400, { message: "Duplicate clientId" });
  }
  for (const card of cards) {
    if (!clientIds.has(card.clientDeckId)) {
      throw new HTTPException(400, { message: "Unknown clientDeckId" });
    }
    if (card.type === "mcq") {
      try {
        assertValidMcqOptions(card.back, card.options);
      } catch (err) {
        throw new HTTPException(400, {
          message: err instanceof Error ? err.message : "Invalid MCQ",
        });
      }
    }
  }

  if (subjects.length === 0 && decks.length === 0 && cards.length === 0) {
    return c.json({ deckCount: 0, cardCount: 0 });
  }

  const db = getDb(c.env);
  const now = new Date().toISOString();
  const clientToServerDeck = new Map<string, string>();
  const clientToServerSubject = new Map<string, string>();
  const statements: D1PreparedStatement[] = [];

  const { results: existingSubjects } = await db
    .prepare(
      "SELECT id, title, created_at FROM subjects WHERE user_id = ? ORDER BY created_at ASC, id ASC",
    )
    .bind(userId)
    .all<{ id: string; title: string; created_at: string }>();

  const subjectByFold = new Map<string, string>();
  for (const subject of existingSubjects ?? []) {
    const key = foldDeckTitle(subject.title);
    if (!subjectByFold.has(key)) subjectByFold.set(key, subject.id);
  }

  for (const subject of subjects) {
    const key = foldDeckTitle(subject.title);
    const hit = subjectByFold.get(key);
    if (hit) {
      clientToServerSubject.set(subject.clientId, hit);
      continue;
    }
    const id = crypto.randomUUID();
    subjectByFold.set(key, id);
    clientToServerSubject.set(subject.clientId, id);
    statements.push(
      db
        .prepare(
          "INSERT INTO subjects (id, user_id, title, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(id, userId, subject.title, now),
    );
  }

  const { results: existingDecks } = await db
    .prepare(
      "SELECT id, title, created_at FROM decks WHERE user_id = ? ORDER BY created_at ASC, id ASC",
    )
    .bind(userId)
    .all<{ id: string; title: string; created_at: string }>();

  const deckByFold = new Map<string, string>();
  for (const deck of existingDecks ?? []) {
    const key = foldDeckTitle(deck.title);
    if (!deckByFold.has(key)) deckByFold.set(key, deck.id);
  }

  const deckMisses = decks.filter((d) => !deckByFold.has(foldDeckTitle(d.title)));
  let unfiledId: string | null = null;
  const needsUnfiled = deckMisses.some(
    (d) =>
      !d.clientSubjectId ||
      !clientToServerSubject.has(d.clientSubjectId),
  );
  if (needsUnfiled) {
    unfiledId = await findOrCreateUnfiled(db, userId, now, statements);
  }

  for (const deck of decks) {
    const key = foldDeckTitle(deck.title);
    const hit = deckByFold.get(key);
    if (hit) {
      clientToServerDeck.set(deck.clientId, hit);
      continue;
    }
    const id = crypto.randomUUID();
    deckByFold.set(key, id);
    clientToServerDeck.set(deck.clientId, id);

    let subjectId: string;
    if (
      deck.clientSubjectId &&
      clientToServerSubject.has(deck.clientSubjectId)
    ) {
      subjectId = clientToServerSubject.get(deck.clientSubjectId)!;
    } else {
      subjectId = unfiledId!;
    }

    statements.push(
      db
        .prepare(
          "INSERT INTO decks (id, user_id, title, subject_hint, subject_id, created_at) VALUES (?, ?, ?, NULL, ?, ?)",
        )
        .bind(id, userId, deck.title, subjectId, now),
    );
  }

  for (const card of cards) {
    const deckId = clientToServerDeck.get(card.clientDeckId);
    if (!deckId) {
      throw new HTTPException(400, { message: "Unknown clientDeckId" });
    }

    let back = card.back;
    let options = card.options;
    if (card.type === "mcq") {
      const mcq = assertValidMcqOptions(card.back, card.options);
      back = mcq.back;
      options = mcq.options;
    }

    const cardId = crypto.randomUUID();
    const schedule = scheduleColumnsFromCard(newCard());
    const provenance = JSON.stringify({
      guest_import: true,
      source: card.source,
    });
    const backJson = encodeStoredBack(card.type, back, options);

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
          card.type,
          JSON.stringify(card.front),
          backJson,
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
