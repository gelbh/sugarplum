import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type DeckRow = {
  id: string;
  user_id: string;
  title: string;
  subject_hint: string | null;
  created_at: string;
};

export type MaterialRow = {
  id: string;
  deck_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
};

/** Pastes ≤100KB use the same R2 path; schema has no body_text column for D1 inline. */
const PASTE_READY = "ready";

function newId(): string {
  return crypto.randomUUID();
}

/** Deck owned by userId, or 404 (do not leak existence to other users). */
export async function requireOwnedDeck(
  db: D1Database,
  deckId: string,
  userId: string,
): Promise<DeckRow> {
  const deck = await db
    .prepare(
      "SELECT id, user_id, title, subject_hint, created_at FROM decks WHERE id = ? AND user_id = ?",
    )
    .bind(deckId, userId)
    .first<DeckRow>();
  if (!deck) throw new HTTPException(404, { message: "Deck not found" });
  return deck;
}

export const deckRoutes = new Hono<AppEnv>();

deckRoutes.post("/", async (c) => {
  const userId = await requireUser(c);
  let body: { title?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) throw new HTTPException(400, { message: "Title required" });

  const id = newId();
  const createdAt = new Date().toISOString();
  const db = getDb(c.env);

  await db
    .prepare(
      "INSERT INTO decks (id, user_id, title, subject_hint, created_at) VALUES (?, ?, ?, NULL, ?)",
    )
    .bind(id, userId, title, createdAt)
    .run();

  return c.json(
    {
      id,
      title,
      subject_hint: null,
      created_at: createdAt,
    },
    201,
  );
});

deckRoutes.get("/", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const { results } = await db
    .prepare(
      "SELECT id, title, subject_hint, created_at FROM decks WHERE user_id = ? ORDER BY created_at ASC",
    )
    .bind(userId)
    .all<{
      id: string;
      title: string;
      subject_hint: string | null;
      created_at: string;
    }>();

  return c.json(results ?? []);
});

deckRoutes.post("/:id/materials/paste", async (c) => {
  const userId = await requireUser(c);
  const deckId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedDeck(db, deckId, userId);

  let body: { text?: unknown; filename?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) throw new HTTPException(400, { message: "Text required" });

  const filename =
    typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim()
      : null;

  const id = newId();
  const createdAt = new Date().toISOString();
  const r2Key = `materials/${deckId}/${id}.txt`;

  await c.env.MATERIALS.put(r2Key, text, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });

  await db
    .prepare(
      "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)",
    )
    .bind(id, deckId, "paste", r2Key, filename, PASTE_READY, createdAt)
    .run();

  const material: MaterialRow = {
    id,
    deck_id: deckId,
    kind: "paste",
    r2_key: r2Key,
    filename,
    page_count: null,
    status: PASTE_READY,
    created_at: createdAt,
  };

  return c.json(material, 201);
});
