import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { composeSubjectKnowledge } from "../../src/study/subjectKnowledge";
import {
  compositionJsonFromSummary,
  listKnowledgeSummariesForUser,
  recomputeSubjectKnowledgeSummary,
} from "./knowledgeSummary";

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

export async function requireOwnedSubject(
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

subjectRoutes.get("/composition-summaries", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const now = new Date();

  const [subjectQuery, existing] = await Promise.all([
    db
      .prepare(
        `-- sugarplum:subject-composition-summaries-subjects
         SELECT id FROM subjects WHERE user_id = ? ORDER BY created_at ASC`,
      )
      .bind(userId)
      .all<{ id: string }>(),
    listKnowledgeSummariesForUser(db, userId),
  ]);
  const subjectRows = subjectQuery.results ?? [];
  const bySubject = new Map(
    existing.map((row) => [row.subject_id, row] as const),
  );

  const out = [];
  for (const subject of subjectRows) {
    let row = bySubject.get(subject.id);
    if (!row) {
      row = await recomputeSubjectKnowledgeSummary(
        db,
        userId,
        subject.id,
        now,
      );
    }
    out.push(compositionJsonFromSummary(row));
  }

  return c.json(out);
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

subjectRoutes.get("/:id/composition", async (c) => {
  const userId = await requireUser(c);
  const subjectId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedSubject(db, subjectId, userId);

  const { results } = await db
    .prepare(
      `-- sugarplum:subject-composition
       SELECT s.state AS state,
              s.scheduled_days AS scheduled_days,
              s.due AS due,
              s.stability AS stability,
              s.difficulty AS difficulty,
              s.elapsed_days AS elapsed_days,
              s.learning_steps AS learning_steps,
              s.reps AS reps,
              s.lapses AS lapses,
              s.last_review AS last_review
       FROM cards c
       INNER JOIN decks d ON d.id = c.deck_id
       LEFT JOIN card_schedules s ON s.card_id = c.id
       WHERE d.subject_id = ? AND d.user_id = ? AND c.status = 'accepted'`,
    )
    .bind(subjectId, userId)
    .all<{
      state: number | null;
      scheduled_days: number | null;
      due: string | null;
      stability: number | null;
      difficulty: number | null;
      elapsed_days: number | null;
      learning_steps: number | null;
      reps: number | null;
      lapses: number | null;
      last_review: string | null;
    }>();

  const now = new Date();
  const rows = (results ?? []).map((row) => ({
    state: row.state ?? null,
    scheduled_days: row.scheduled_days ?? null,
    due: row.due ?? null,
    stability: row.stability ?? null,
    difficulty: row.difficulty ?? null,
    elapsed_days: row.elapsed_days ?? null,
    learning_steps: row.learning_steps ?? null,
    reps: row.reps ?? null,
    lapses: row.lapses ?? null,
    last_review: row.last_review ?? null,
  }));

  return c.json(composeSubjectKnowledge(rows, now));
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
