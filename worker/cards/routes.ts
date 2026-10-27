import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { assertSingleCloze } from "../generation/schema";
import { newCard, scheduleColumnsFromCard } from "../study/fsrs";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type CardRow = {
  id: string;
  deck_id: string;
  job_id: string | null;
  type: string;
  front_json: string;
  back_json: string;
  media_r2_keys_json: string | null;
  provenance_json: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

const PatchDraftSchema = z
  .object({
    front: z.string().min(1).optional(),
    back: z.string().min(1).optional(),
    type: z.enum(["qa", "cloze", "image_label", "diagram"]).optional(),
  })
  .refine(
    (body) =>
      body.front !== undefined ||
      body.back !== undefined ||
      body.type !== undefined,
    { message: "No fields to update" },
  );

function parseJsonField<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Public card JSON for draft review / study clients. */
export function serializeCard(row: CardRow) {
  return {
    id: row.id,
    deck_id: row.deck_id,
    job_id: row.job_id,
    type: row.type,
    front: parseJsonField(row.front_json, row.front_json),
    back: parseJsonField(row.back_json, row.back_json),
    media_r2_keys: row.media_r2_keys_json
      ? parseJsonField<string[]>(row.media_r2_keys_json, [])
      : [],
    provenance: row.provenance_json
      ? parseJsonField(row.provenance_json, null)
      : null,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function requireOwnedCard(
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

async function acceptDraftCard(
  db: D1Database,
  cardId: string,
): Promise<"accepted" | "conflict"> {
  const schedule = scheduleColumnsFromCard(newCard());
  const updatedAt = new Date().toISOString();
  // Atomic: accepted status + schedule row succeed or fail together.
  // Status CAS prevents concurrent reject/accept races.
  const results = await db.batch([
    db
      .prepare(
        `UPDATE cards SET status = ?, updated_at = ? WHERE id = ? AND status = ?`,
      )
      .bind("accepted", updatedAt, cardId, "draft"),
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
  ]);
  if (!results[0]?.meta.changes) return "conflict";
  return "accepted";
}

export const cardRoutes = new Hono<AppEnv>();

/** List draft cards for a generation job (owner only). */
export const jobDraftRoutes = new Hono<AppEnv>();

jobDraftRoutes.get("/:id/drafts", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");
  const db = getDb(c.env);

  const job = await db
    .prepare(
      `SELECT j.id
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ? AND d.user_id = ?`,
    )
    .bind(jobId, userId)
    .first<{ id: string }>();
  if (!job) throw new HTTPException(404, { message: "Job not found" });

  const { results } = await db
    .prepare(
      `SELECT id, deck_id, job_id, type, front_json, back_json,
              media_r2_keys_json, provenance_json, status, created_at, updated_at
       FROM cards
       WHERE job_id = ? AND status = ?
       ORDER BY created_at ASC`,
    )
    .bind(jobId, "draft")
    .all<CardRow>();

  return c.json((results ?? []).map(serializeCard));
});

jobDraftRoutes.post("/:id/drafts/accept-all", async (c) => {
  const userId = await requireUser(c);
  const jobId = c.req.param("id");
  const db = getDb(c.env);

  const job = await db
    .prepare(
      `SELECT j.id
       FROM generation_jobs j
       INNER JOIN materials m ON m.id = j.material_id
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE j.id = ? AND d.user_id = ?`,
    )
    .bind(jobId, userId)
    .first<{ id: string }>();
  if (!job) throw new HTTPException(404, { message: "Job not found" });

  const { results } = await db
    .prepare(
      `SELECT id FROM cards WHERE job_id = ? AND status = ? ORDER BY created_at ASC`,
    )
    .bind(jobId, "draft")
    .all<{ id: string }>();

  let accepted = 0;
  let failed = 0;
  for (const row of results ?? []) {
    try {
      const outcome = await acceptDraftCard(db, row.id);
      if (outcome === "accepted") accepted += 1;
      else failed += 1;
    } catch {
      // CAS/schedule race or D1 abort: count as failed, keep accepting the rest.
      failed += 1;
    }
  }

  return c.json({ accepted, failed });
});

cardRoutes.patch("/:id", async (c) => {
  const userId = await requireUser(c);
  const cardId = c.req.param("id");
  const db = getDb(c.env);
  const row = await requireOwnedCard(db, cardId, userId);

  if (row.status !== "draft") {
    throw new HTTPException(400, { message: "Only draft cards can be edited" });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const parsed = PatchDraftSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues[0]?.message ?? "Invalid patch body",
    });
  }

  const nextType = parsed.data.type ?? row.type;
  const nextFront =
    parsed.data.front ?? parseJsonField<string>(row.front_json, "");
  const nextBack =
    parsed.data.back ?? parseJsonField<string>(row.back_json, "");

  const allowedTypes = new Set(["qa", "cloze", "image_label", "diagram"]);
  if (!allowedTypes.has(nextType)) {
    throw new HTTPException(400, { message: "Unsupported card type" });
  }
  if (nextType === "cloze") {
    try {
      assertSingleCloze(nextFront);
    } catch (err) {
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : "Invalid cloze",
      });
    }
  }

  const updatedAt = new Date().toISOString();
  await db
    .prepare(
      `UPDATE cards
       SET type = ?, front_json = ?, back_json = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      nextType,
      JSON.stringify(nextFront),
      JSON.stringify(nextBack),
      updatedAt,
      cardId,
    )
    .run();

  return c.json(
    serializeCard({
      ...row,
      type: nextType,
      front_json: JSON.stringify(nextFront),
      back_json: JSON.stringify(nextBack),
      updated_at: updatedAt,
    }),
  );
});

cardRoutes.post("/:id/accept", async (c) => {
  const userId = await requireUser(c);
  const cardId = c.req.param("id");
  const db = getDb(c.env);
  const row = await requireOwnedCard(db, cardId, userId);

  if (row.status !== "draft") {
    throw new HTTPException(400, {
      message: "Only draft cards can be accepted",
    });
  }

  const outcome = await acceptDraftCard(db, cardId);
  if (outcome === "conflict") {
    throw new HTTPException(409, {
      message: "Card is no longer a draft",
    });
  }

  const updatedAt = new Date().toISOString();
  return c.json(
    serializeCard({ ...row, status: "accepted", updated_at: updatedAt }),
  );
});

cardRoutes.post("/:id/reject", async (c) => {
  const userId = await requireUser(c);
  const cardId = c.req.param("id");
  const db = getDb(c.env);
  const row = await requireOwnedCard(db, cardId, userId);

  if (row.status !== "draft") {
    throw new HTTPException(400, {
      message: "Only draft cards can be rejected",
    });
  }

  const updatedAt = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE cards SET status = ?, updated_at = ? WHERE id = ? AND status = ?`,
    )
    .bind("rejected", updatedAt, cardId, "draft")
    .run();
  if (!result.meta.changes) {
    throw new HTTPException(409, {
      message: "Card is no longer a draft",
    });
  }

  return c.json(
    serializeCard({ ...row, status: "rejected", updated_at: updatedAt }),
  );
});
