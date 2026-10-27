import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import {
  assertSingleCloze,
  assertValidMcqOptions,
  OcclusionFrontSchema,
} from "../generation/schema";
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

const OcclusionBackSchema = z.object({ answer: z.string().min(1) });
const TextFaceSchema = z.string().min(1);
/** Cloze Extra may be empty; other text backs still validated in the handler. */
const TextBackPatchSchema = z.string();
const CardTypeSchema = z.enum([
  "qa",
  "cloze",
  "image_label",
  "diagram",
  "mcq",
  "occlusion",
]);

/** PATCH body: string faces for text/MCQ; structured faces for occlusion. */
const PatchDraftSchema = z
  .object({
    front: z.union([TextFaceSchema, OcclusionFrontSchema]).optional(),
    back: z.union([TextBackPatchSchema, OcclusionBackSchema]).optional(),
    options: z.array(z.string()).optional(),
    type: CardTypeSchema.optional(),
  })
  .refine(
    (body) =>
      body.front !== undefined ||
      body.back !== undefined ||
      body.options !== undefined ||
      body.type !== undefined,
    { message: "No fields to update" },
  );

type McqBackJson = { answer: string; options: string[] };

function isMcqBackJson(value: unknown): value is McqBackJson {
  return (
    typeof value === "object" &&
    value !== null &&
    "answer" in value &&
    typeof (value as McqBackJson).answer === "string" &&
    "options" in value &&
    Array.isArray((value as McqBackJson).options)
  );
}

function decodeStoredBack(
  type: string,
  backJson: string,
): { back: string; options?: string[] } {
  if (type !== "mcq") {
    return { back: parseJsonField<string>(backJson, backJson) };
  }
  const parsed = parseJsonField<unknown>(backJson, null);
  if (isMcqBackJson(parsed)) {
    return { back: parsed.answer, options: parsed.options };
  }
  return { back: parseJsonField<string>(backJson, "") };
}

function encodeStoredBack(
  type: string,
  back: string,
  options?: string[],
): string {
  if (type === "mcq") {
    return JSON.stringify({ answer: back, options: options ?? [] });
  }
  return JSON.stringify(back);
}

function parseJsonField<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Public card JSON for draft review / study clients. */
export function serializeCard(row: CardRow) {
  const front = parseJsonField(row.front_json, row.front_json);
  const media_r2_keys = row.media_r2_keys_json
    ? parseJsonField<string[]>(row.media_r2_keys_json, [])
    : [];
  const provenance = row.provenance_json
    ? parseJsonField(row.provenance_json, null)
    : null;
  const base = {
    id: row.id,
    deck_id: row.deck_id,
    job_id: row.job_id,
    type: row.type,
    front,
    media_r2_keys,
    provenance,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (row.type === "occlusion") {
    return {
      ...base,
      back: parseJsonField(row.back_json, row.back_json),
    };
  }
  const { back, options } = decodeStoredBack(row.type, row.back_json);
  const card = { ...base, back };
  if (row.type === "mcq" && options !== undefined) {
    return { ...card, options };
  }
  return card;
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
      `SELECT id, type, back_json, status FROM cards
       WHERE job_id = ? AND status = ? ORDER BY created_at ASC`,
    )
    .bind(jobId, "draft")
    .all<{ id: string; type: string; back_json: string; status: string }>();

  let accepted = 0;
  let failed = 0;
  for (const row of results ?? []) {
    try {
      const outcome = await acceptDraftCard(db, row);
      if (outcome === "accepted") accepted += 1;
      else failed += 1;
    } catch (err) {
      // Schedule race or D1 abort: count as failed, keep accepting the rest.
      console.error("accept-all failed for card", row.id, err);
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
    parsed.data.front ?? parseJsonField(row.front_json, row.front_json);

  if (nextType === "occlusion") {
    const nextBack =
      parsed.data.back ?? parseJsonField(row.back_json, row.back_json);
    const frontOk = OcclusionFrontSchema.safeParse(nextFront);
    const backOk = OcclusionBackSchema.safeParse(nextBack);
    if (!frontOk.success || !backOk.success) {
      throw new HTTPException(400, {
        message:
          "Occlusion cards need structured front regions and back.answer",
      });
    }
    const persistFront = frontOk.data;
    const persistBack = backOk.data;
    const updatedAt = new Date().toISOString();
    await db
      .prepare(
        `UPDATE cards
         SET type = ?, front_json = ?, back_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        nextType,
        JSON.stringify(persistFront),
        JSON.stringify(persistBack),
        updatedAt,
        cardId,
      )
      .run();
    return c.json(
      serializeCard({
        ...row,
        type: nextType,
        front_json: JSON.stringify(persistFront),
        back_json: JSON.stringify(persistBack),
        updated_at: updatedAt,
      }),
    );
  }

  const storedBack = decodeStoredBack(row.type, row.back_json);
  const allowedTypes = new Set([
    "qa",
    "cloze",
    "image_label",
    "diagram",
    "mcq",
  ]);
  if (!allowedTypes.has(nextType)) {
    throw new HTTPException(400, { message: "Unsupported card type" });
  }
  if (typeof nextFront !== "string") {
    throw new HTTPException(400, {
      message: "Text card front must be a string",
    });
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

  let nextBack: string;
  let nextOptions: string[] | undefined;
  if (nextType === "mcq") {
    const prior =
      row.type === "mcq"
        ? storedBack
        : {
            back:
              typeof parsed.data.back === "string" ? parsed.data.back : "",
            options: undefined as string[] | undefined,
          };
    const patchBack =
      typeof parsed.data.back === "string" ? parsed.data.back : prior.back;
    try {
      const mcq = assertValidMcqOptions(
        patchBack,
        parsed.data.options ?? prior.options,
      );
      nextBack = mcq.back;
      nextOptions = mcq.options;
    } catch (err) {
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : "Invalid MCQ",
      });
    }
  } else {
    if (parsed.data.back !== undefined && typeof parsed.data.back !== "string") {
      throw new HTTPException(400, {
        message: "Text card back must be a string",
      });
    }
    nextBack =
      typeof parsed.data.back === "string" ? parsed.data.back : storedBack.back;
    // Cloze Extra may be ""; other text types still need a non-empty back.
    if (nextType !== "cloze" && nextBack.trim().length < 1) {
      throw new HTTPException(400, { message: "Back cannot be empty" });
    }
  }

  const nextBackJson = encodeStoredBack(nextType, nextBack, nextOptions);

  const updatedAt = new Date().toISOString();
  await db
    .prepare(
      `UPDATE cards
       SET type = ?, front_json = ?, back_json = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(nextType, JSON.stringify(nextFront), nextBackJson, updatedAt, cardId)
    .run();

  return c.json(
    serializeCard({
      ...row,
      type: nextType,
      front_json: JSON.stringify(nextFront),
      back_json: nextBackJson,
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

  const outcome = await acceptDraftCard(db, row);
  if (outcome === "conflict") {
    throw new HTTPException(409, {
      message: "Card is no longer a draft",
    });
  }
  if (outcome === "invalid") {
    throw new HTTPException(400, {
      message: "Invalid MCQ card; fix options before accepting",
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
