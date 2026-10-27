import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type SubjectRow = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
};

function newId(): string {
  return crypto.randomUUID();
}

async function requireOwnedSubject(
  db: D1Database,
  subjectId: string,
  userId: string,
): Promise<SubjectRow> {
  const subject = await db
    .prepare(
      "SELECT id, user_id, title, created_at FROM subjects WHERE id = ? AND user_id = ?",
    )
    .bind(subjectId, userId)
    .first<SubjectRow>();
  if (!subject) throw new HTTPException(404, { message: "Subject not found" });
  return subject;
}

async function deckCountForSubject(
  db: D1Database,
  subjectId: string,
): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM decks WHERE subject_id = ?")
    .bind(subjectId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export const subjectRoutes = new Hono<AppEnv>();

subjectRoutes.get("/", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const { results } = await db
    .prepare(
      `SELECT id, title, created_at,
        (SELECT COUNT(*) FROM decks WHERE subject_id = subjects.id) AS deck_count
       FROM subjects WHERE user_id = ? ORDER BY created_at ASC`,
    )
    .bind(userId)
    .all<{
      id: string;
      title: string;
      created_at: string;
      deck_count: number;
    }>();

  return c.json(results ?? []);
});

subjectRoutes.post("/", async (c) => {
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
      "INSERT INTO subjects (id, user_id, title, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(id, userId, title, createdAt)
    .run();

  return c.json(
    {
      id,
      title,
      created_at: createdAt,
      deck_count: 0,
    },
    201,
  );
});

subjectRoutes.patch("/:id", async (c) => {
  const userId = await requireUser(c);
  const subjectId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedSubject(db, subjectId, userId);

  let body: { title?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) throw new HTTPException(400, { message: "Title required" });

  await db
    .prepare("UPDATE subjects SET title = ? WHERE id = ? AND user_id = ?")
    .bind(title, subjectId, userId)
    .run();

  const deck_count = await deckCountForSubject(db, subjectId);
  const subject = await requireOwnedSubject(db, subjectId, userId);

  return c.json({
    id: subject.id,
    title: subject.title,
    created_at: subject.created_at,
    deck_count,
  });
});

subjectRoutes.delete("/:id", async (c) => {
  const userId = await requireUser(c);
  const subjectId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedSubject(db, subjectId, userId);

  const deck_count = await deckCountForSubject(db, subjectId);
  if (deck_count > 0) {
    return c.json({ error: "Subject still has decks", deck_count }, 409);
  }

  const result = await db
    .prepare("DELETE FROM subjects WHERE id = ? AND user_id = ?")
    .bind(subjectId, userId)
    .run();

  if (!result.meta.changes) {
    throw new HTTPException(404, { message: "Subject not found" });
  }

  return c.body(null, 204);
});
