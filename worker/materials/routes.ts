import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import {
  enqueueGeneration,
  type FigureExtractMode,
} from "../generation/enqueue";
import { normalizeTopicHints } from "../generation/topic-hints";
import {
  findReadyMaterialByContentHash,
  sha256Hex,
} from "./content-hash";
import {
  assertSingleCloze,
  assertValidMcqOptions,
  OcclusionFrontSchema,
} from "../generation/schema";
import {
  encodeStoredBack,
  serializeCard,
  type CardRow,
} from "../cards/routes";
import { newCard, scheduleColumnsFromCard } from "../study/fsrs";
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_PASTE_BYTES } from "./limits";
import { MAX_FIGURES_PER_PDF } from "./docling";
import { figureR2Key } from "./figures";
import { createR2PutUrl } from "./r2-presign";

export { MAX_IMAGE_BYTES } from "./limits";

type AppEnv = { Bindings: Env; Variables: AuthVariables };

export type DeckRow = {
  id: string;
  user_id: string;
  title: string;
  subject_hint: string | null;
  subject_id: string | null;
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
  content_hash?: string | null;
};

/** Pastes ≤100KB use the same R2 path; schema has no body_text column for D1 inline. */
const PASTE_READY = "ready";
const FILE_UPLOADING = "uploading";
const FILE_READY = "ready";
const PDF_CONTENT_TYPE = "application/pdf";
const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_R2_BUCKET = "sugarplum-materials";
const ZIP_CONTENT_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

type UploadKind = "pdf" | "pptx" | "image";

function resolveUpload(
  contentType: string,
  filename: string,
): { kind: UploadKind; ext: string } | null {
  const lowerName = filename.toLowerCase();
  if (contentType === PDF_CONTENT_TYPE) return { kind: "pdf", ext: "pdf" };
  if (contentType === PPTX_CONTENT_TYPE) return { kind: "pptx", ext: "pptx" };
  if (ZIP_CONTENT_TYPES.has(contentType) && lowerName.endsWith(".pptx")) {
    return { kind: "pptx", ext: "pptx" };
  }
  if (IMAGE_CONTENT_TYPES.has(contentType)) {
    const ext =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "jpg";
    return { kind: "image", ext };
  }
  return null;
}

function assertConfiguredR2AccountId(accountId: string): void {
  const trimmed = accountId.trim();
  if (
    !trimmed ||
    trimmed.startsWith("REPLACE_") ||
    trimmed.includes("REPLACE_WITH")
  ) {
    throw new HTTPException(500, {
      message: "R2_ACCOUNT_ID is not configured",
    });
  }
}

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
      "SELECT id, user_id, title, subject_hint, subject_id, created_at FROM decks WHERE id = ? AND user_id = ?",
    )
    .bind(deckId, userId)
    .first<DeckRow>();
  if (!deck) throw new HTTPException(404, { message: "Deck not found" });
  return deck;
}

async function requireOwnedSubjectId(
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

function deckJson(deck: {
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

async function requireOwnedMaterial(
  db: D1Database,
  materialId: string,
  userId: string,
): Promise<MaterialRow> {
  const row = await db
    .prepare(
      `SELECT m.id, m.deck_id, m.kind, m.r2_key, m.filename, m.page_count, m.status, m.created_at
       FROM materials m
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE m.id = ? AND d.user_id = ?`,
    )
    .bind(materialId, userId)
    .first<MaterialRow>();
  if (!row) throw new HTTPException(404, { message: "Material not found" });
  return row;
}

export const deckRoutes = new Hono<AppEnv>();

deckRoutes.post("/", async (c) => {
  const userId = await requireUser(c);
  let body: { title?: unknown; subjectId?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) throw new HTTPException(400, { message: "Title required" });

  const subjectId =
    typeof body.subjectId === "string" ? body.subjectId.trim() : "";
  if (!subjectId) {
    throw new HTTPException(400, { message: "subjectId required" });
  }

  const id = newId();
  const createdAt = new Date().toISOString();
  const db = getDb(c.env);
  await requireOwnedSubjectId(db, subjectId, userId);

  await db
    .prepare(
      "INSERT INTO decks (id, user_id, title, subject_hint, subject_id, created_at) VALUES (?, ?, ?, NULL, ?, ?)",
    )
    .bind(id, userId, title, subjectId, createdAt)
    .run();

  return c.json(
    deckJson({
      id,
      title,
      subject_hint: null,
      subject_id: subjectId,
      created_at: createdAt,
    }),
    201,
  );
});

deckRoutes.get("/", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const subjectId = c.req.query("subjectId")?.trim() || null;

  type DeckListRow = {
    id: string;
    title: string;
    subject_hint: string | null;
    subject_id: string | null;
    created_at: string;
  };

  if (subjectId) {
    const { results } = await db
      .prepare(
        "SELECT id, title, subject_hint, subject_id, created_at FROM decks WHERE user_id = ? AND subject_id = ? ORDER BY created_at ASC",
      )
      .bind(userId, subjectId)
      .all<DeckListRow>();
    return c.json(results ?? []);
  }

  const { results } = await db
    .prepare(
      "SELECT id, title, subject_hint, subject_id, created_at FROM decks WHERE user_id = ? ORDER BY created_at ASC",
    )
    .bind(userId)
    .all<DeckListRow>();

  return c.json(results ?? []);
});

deckRoutes.get("/:id/stats", async (c) => {
  const userId = await requireUser(c);
  const deckId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedDeck(db, deckId, userId);

  const accepted = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM cards WHERE deck_id = ? AND status = 'accepted'",
    )
    .bind(deckId)
    .first<{ count: number }>();
  const draft = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM cards WHERE deck_id = ? AND status = 'draft'",
    )
    .bind(deckId)
    .first<{ count: number }>();
  const archived = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM cards WHERE deck_id = ? AND status = 'archived'",
    )
    .bind(deckId)
    .first<{ count: number }>();
  const materials = await db
    .prepare("SELECT COUNT(*) AS count FROM materials WHERE deck_id = ?")
    .bind(deckId)
    .first<{ count: number }>();

  return c.json({
    accepted: accepted?.count ?? 0,
    draft: draft?.count ?? 0,
    archived: archived?.count ?? 0,
    materials: materials?.count ?? 0,
  });
});

const HubCreateTextCardSchema = z
  .object({
    type: z.enum(["qa", "cloze", "mcq"]),
    front: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().min(1)),
    /** Cloze Extra may be ""; study answer comes from the blank. */
    back: z.string().transform((s) => s.trim()),
    options: z.array(z.string()).optional(),
  })
  .refine((body) => body.type === "cloze" || body.back.length > 0, {
    message: "Back is required",
    path: ["back"],
  });

const HubCreateImageLabelSchema = z.object({
  type: z.literal("image_label"),
  front: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1)),
  back: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1)),
  media_r2_keys: z.array(z.string().min(1)).min(1),
});

const HubCreateOcclusionSchema = z.object({
  type: z.literal("occlusion"),
  front: OcclusionFrontSchema,
  back: z.object({ answer: z.string().min(1) }),
});

const HubCreateCardSchema = z.union([
  HubCreateTextCardSchema,
  HubCreateImageLabelSchema,
  HubCreateOcclusionSchema,
]);

async function assertDeckMaterialKeys(
  db: ReturnType<typeof getDb>,
  deckId: string,
  keys: string[],
): Promise<void> {
  if (keys.length === 0) return;
  const { results } = await db
    .prepare(
      "SELECT r2_key FROM materials WHERE deck_id = ? AND r2_key IS NOT NULL",
    )
    .bind(deckId)
    .all<{ r2_key: string }>();
  const allowed = new Set((results ?? []).map((row) => row.r2_key));
  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new HTTPException(400, {
        message: "Media key not found for deck",
      });
    }
  }
}

deckRoutes.get("/:id/cards", async (c) => {
  const userId = await requireUser(c);
  const deckId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedDeck(db, deckId, userId);

  const statusParam = c.req.query("status");
  const listStatus =
    statusParam === "archived"
      ? "archived"
      : statusParam === undefined || statusParam === "accepted"
        ? "accepted"
        : null;
  if (listStatus === null) {
    throw new HTTPException(400, { message: "Invalid status filter" });
  }

  const { results } = await db
    .prepare(
      `SELECT id, deck_id, job_id, type, front_json, back_json,
              media_r2_keys_json, provenance_json, status, created_at, updated_at
       FROM cards
       WHERE deck_id = ? AND status = ?
       ORDER BY created_at ASC`,
    )
    .bind(deckId, listStatus)
    .all<CardRow>();

  return c.json((results ?? []).map(serializeCard));
});

deckRoutes.post("/:id/cards", async (c) => {
  const userId = await requireUser(c);
  const deckId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedDeck(db, deckId, userId);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const parsed = HubCreateCardSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues[0]?.message ?? "Invalid card body",
    });
  }

  const id = newId();
  const now = new Date().toISOString();
  const schedule = scheduleColumnsFromCard(newCard());

  let type: string;
  let frontJson: string;
  let backJson: string;
  let mediaR2KeysJson: string | null = null;

  if (parsed.data.type === "occlusion") {
    type = "occlusion";
    const { front, back } = parsed.data;
    await assertDeckMaterialKeys(db, deckId, [front.image_key]);
    frontJson = JSON.stringify(front);
    backJson = JSON.stringify(back);
    mediaR2KeysJson = JSON.stringify([front.image_key]);
  } else if (parsed.data.type === "image_label") {
    type = "image_label";
    const { front, back, media_r2_keys } = parsed.data;
    await assertDeckMaterialKeys(db, deckId, media_r2_keys);
    frontJson = JSON.stringify(front);
    backJson = JSON.stringify(back);
    mediaR2KeysJson = JSON.stringify(media_r2_keys);
  } else {
    type = parsed.data.type;
    const { front } = parsed.data;
    let back = parsed.data.back;
    let options = parsed.data.options;

    if (type === "cloze") {
      try {
        assertSingleCloze(front);
      } catch (err) {
        throw new HTTPException(400, {
          message: err instanceof Error ? err.message : "Invalid cloze",
        });
      }
    }

    if (type === "mcq") {
      try {
        const mcq = assertValidMcqOptions(back, options);
        back = mcq.back;
        options = mcq.options;
      } catch (err) {
        throw new HTTPException(400, {
          message: err instanceof Error ? err.message : "Invalid MCQ",
        });
      }
    }

    frontJson = JSON.stringify(front);
    backJson = encodeStoredBack(type, back, options);
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO cards (
          id, deck_id, job_id, type, front_json, back_json,
          media_r2_keys_json, provenance_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        deckId,
        null,
        type,
        frontJson,
        backJson,
        mediaR2KeysJson,
        null,
        "accepted",
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO card_schedules (
           card_id, due, stability, difficulty, elapsed_days, scheduled_days,
           learning_steps, reps, lapses, state, last_review
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
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

  return c.json(
    serializeCard({
      id,
      deck_id: deckId,
      job_id: null,
      type,
      front_json: frontJson,
      back_json: backJson,
      media_r2_keys_json: mediaR2KeysJson,
      provenance_json: null,
      status: "accepted",
      created_at: now,
      updated_at: now,
    }),
    201,
  );
});

deckRoutes.patch("/:id", async (c) => {
  const userId = await requireUser(c);
  const deckId = c.req.param("id");
  const db = getDb(c.env);
  const deck = await requireOwnedDeck(db, deckId, userId);

  let body: { title?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) throw new HTTPException(400, { message: "Title required" });

  await db
    .prepare("UPDATE decks SET title = ? WHERE id = ? AND user_id = ?")
    .bind(title, deckId, userId)
    .run();

  return c.json(
    deckJson({
      id: deck.id,
      title,
      subject_hint: deck.subject_hint,
      subject_id: deck.subject_id ?? null,
      created_at: deck.created_at,
    }),
  );
});

deckRoutes.delete("/:id", async (c) => {
  const userId = await requireUser(c);
  const deckId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedDeck(db, deckId, userId);

  const keys = new Set<string>();
  const { results: materialKeys } = await db
    .prepare(
      "SELECT r2_key FROM materials WHERE deck_id = ? AND r2_key IS NOT NULL",
    )
    .bind(deckId)
    .all<{ r2_key: string }>();
  for (const row of materialKeys ?? []) {
    if (row.r2_key) keys.add(row.r2_key);
  }
  const { results: cardMedia } = await db
    .prepare(
      "SELECT media_r2_keys_json FROM cards WHERE deck_id = ? AND media_r2_keys_json IS NOT NULL",
    )
    .bind(deckId)
    .all<{ media_r2_keys_json: string }>();
  for (const row of cardMedia ?? []) {
    try {
      const parsed = JSON.parse(row.media_r2_keys_json) as unknown;
      if (Array.isArray(parsed)) {
        for (const key of parsed) {
          if (typeof key === "string" && key) keys.add(key);
        }
      }
    } catch {
      /* ignore bad JSON */
    }
  }

  for (const key of keys) {
    try {
      await c.env.MATERIALS.delete(key);
    } catch {
      /* best-effort; D1 row still removed */
    }
  }

  await db
    .prepare("DELETE FROM decks WHERE id = ? AND user_id = ?")
    .bind(deckId, userId)
    .run();

  return c.body(null, 204);
});

deckRoutes.post("/:id/materials/paste", async (c) => {
  const userId = await requireUser(c);
  const deckId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedDeck(db, deckId, userId);

  let body: { text?: unknown; filename?: unknown; topicHints?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) throw new HTTPException(400, { message: "Text required" });
  const textBytes = new TextEncoder().encode(text).byteLength;
  if (textBytes > MAX_PASTE_BYTES) {
    throw new HTTPException(400, {
      message: "Paste must be 100KB or smaller",
    });
  }

  let topicHints: string[] | null = null;
  try {
    topicHints = normalizeTopicHints(body.topicHints);
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : "Invalid topicHints",
    });
  }

  const filename =
    typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim()
      : null;

  const contentHash = await sha256Hex(text);
  const hit = await findReadyMaterialByContentHash(db, deckId, contentHash);

  if (hit?.jobId) {
    return c.json(
      {
        id: hit.materialId,
        deck_id: hit.deck_id,
        kind: hit.kind,
        r2_key: hit.r2_key,
        filename: hit.filename,
        page_count: hit.page_count,
        status: hit.status,
        created_at: hit.created_at,
        jobId: hit.jobId,
        reused: true,
      },
      200,
    );
  }

  if (hit && !hit.jobId) {
    const jobId = await enqueueGeneration(c.env, {
      materialId: hit.materialId,
      deckId,
      topicHints,
    });
    return c.json(
      {
        id: hit.materialId,
        deck_id: hit.deck_id,
        kind: hit.kind,
        r2_key: hit.r2_key,
        filename: hit.filename,
        page_count: hit.page_count,
        status: hit.status,
        created_at: hit.created_at,
        jobId,
        reused: false,
      },
      200,
    );
  }

  const id = newId();
  const createdAt = new Date().toISOString();
  const r2Key = `materials/${deckId}/${id}.txt`;

  await c.env.MATERIALS.put(r2Key, text, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });

  await db
    .prepare(
      "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      deckId,
      "paste",
      r2Key,
      filename,
      null,
      PASTE_READY,
      createdAt,
      contentHash,
    )
    .run();

  const jobId = await enqueueGeneration(c.env, {
    materialId: id,
    deckId,
    topicHints,
  });

  const material: MaterialRow = {
    id,
    deck_id: deckId,
    kind: "paste",
    r2_key: r2Key,
    filename,
    page_count: null,
    status: PASTE_READY,
    created_at: createdAt,
    content_hash: contentHash,
  };

  return c.json({ ...material, jobId }, 201);
});

deckRoutes.post("/:id/topic-generate", async (c) => {
  const userId = await requireUser(c);
  const deckId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedDeck(db, deckId, userId);

  let body: { topic?: unknown; materialId?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const topicRaw = typeof body.topic === "string" ? body.topic : "";
  let topicHints: string[] | null;
  try {
    topicHints = normalizeTopicHints([topicRaw]);
  } catch (err) {
    throw new HTTPException(400, {
      message: err instanceof Error ? err.message : "Invalid topic",
    });
  }
  if (!topicHints) {
    throw new HTTPException(400, { message: "Topic required" });
  }

  const explicitMaterialId =
    typeof body.materialId === "string" && body.materialId.trim()
      ? body.materialId.trim()
      : null;

  let materialId: string;
  if (explicitMaterialId) {
    const material = await requireOwnedMaterial(
      db,
      explicitMaterialId,
      userId,
    );
    if (material.deck_id !== deckId) {
      throw new HTTPException(404, { message: "Material not found" });
    }
    if (
      (material.kind !== "paste" && material.kind !== "pdf") ||
      material.status !== PASTE_READY
    ) {
      throw new HTTPException(422, {
        message: "No material available for topic generation",
      });
    }
    materialId = material.id;
  } else {
    const { results } = await db
      .prepare(
        "SELECT id, kind, status, created_at FROM materials WHERE deck_id = ?",
      )
      .bind(deckId)
      .all<{
        id: string;
        kind: string;
        status: string;
        created_at: string;
      }>();
    const latest = (results ?? [])
      .filter(
        (m) =>
          (m.kind === "paste" || m.kind === "pdf") && m.status === PASTE_READY,
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!latest) {
      throw new HTTPException(422, {
        message: "No material available for topic generation",
      });
    }
    materialId = latest.id;
  }

  const jobId = await enqueueGeneration(c.env, {
    materialId,
    deckId,
    topicHints,
  });

  return c.json({ jobId }, 201);
});

deckRoutes.post("/:id/materials/upload-url", async (c) => {
  const userId = await requireUser(c);
  const deckId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedDeck(db, deckId, userId);

  let body: { filename?: unknown; contentType?: unknown; size?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const contentType =
    typeof body.contentType === "string" ? body.contentType.trim() : "";
  const filenameHint =
    typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim()
      : "";
  const resolved = resolveUpload(contentType, filenameHint);
  if (!resolved) {
    throw new HTTPException(400, {
      message: "Only PDF, PPTX, or image (jpeg/png/webp) uploads are allowed",
    });
  }

  const size = typeof body.size === "number" ? body.size : Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    throw new HTTPException(400, { message: "Valid size required" });
  }
  if (size > MAX_FILE_BYTES) {
    throw new HTTPException(400, { message: "File must be 25MB or smaller" });
  }
  if (resolved.kind === "image" && size > MAX_IMAGE_BYTES) {
    throw new HTTPException(400, {
      message: `Images for generation must be ${MAX_IMAGE_BYTES / (1024 * 1024)}MB or smaller`,
    });
  }

  const defaultName = `upload.${resolved.ext}`;
  const filename = filenameHint || defaultName;
  const putContentType =
    resolved.kind === "pptx" ? PPTX_CONTENT_TYPE : contentType;

  const materialId = newId();
  const createdAt = new Date().toISOString();
  const r2Key = `materials/${deckId}/${materialId}.${resolved.ext}`;

  const accountId = c.env.R2_ACCOUNT_ID;
  const accessKeyId = c.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = c.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new HTTPException(500, {
      message: "R2 upload signing is not configured",
    });
  }
  assertConfiguredR2AccountId(accountId);

  const uploadUrl = await createR2PutUrl({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: c.env.R2_BUCKET_NAME ?? DEFAULT_R2_BUCKET,
    key: r2Key,
    contentType: putContentType,
    contentLength: size,
  });

  await db
    .prepare(
      "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      materialId,
      deckId,
      resolved.kind,
      r2Key,
      filename,
      null,
      FILE_UPLOADING,
      createdAt,
    )
    .run();

  return c.json({ materialId, uploadUrl, r2Key });
});

export const materialRoutes = new Hono<AppEnv>();

materialRoutes.post("/:id/figures/presign", async (c) => {
  const userId = await requireUser(c);
  const pdfMaterialId = c.req.param("id");
  const db = getDb(c.env);
  const parent = await requireOwnedMaterial(db, pdfMaterialId, userId);

  if (
    parent.kind !== "pdf" ||
    (parent.status !== FILE_UPLOADING && parent.status !== FILE_READY)
  ) {
    throw new HTTPException(400, {
      message: "Figure crops can only be attached to an uploading or ready PDF",
    });
  }

  let body: {
    filename?: unknown;
    contentType?: unknown;
    size?: unknown;
    index?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const filename =
    typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim()
      : "figure.png";
  if (body.contentType !== "image/png") {
    throw new HTTPException(400, {
      message: "Figure crops must be PNG images",
    });
  }
  const size = typeof body.size === "number" ? body.size : Number(body.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
    throw new HTTPException(400, {
      message: `Figure crops must be ${MAX_IMAGE_BYTES / (1024 * 1024)}MB or smaller`,
    });
  }
  const index =
    typeof body.index === "number" ? body.index : Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index >= MAX_FIGURES_PER_PDF) {
    throw new HTTPException(400, {
      message: `Figure crop index must be an integer from 0 to ${MAX_FIGURES_PER_PDF - 1}`,
    });
  }

  const r2Key = figureR2Key(parent.deck_id, pdfMaterialId, index);
  const existingFigure = await db
    .prepare("SELECT id FROM materials WHERE r2_key = ?")
    .bind(r2Key)
    .first<{ id: string }>();
  if (existingFigure) {
    throw new HTTPException(409, {
      message: `Figure crop index ${index} is already attached to this PDF`,
    });
  }

  const materialId = newId();
  const createdAt = new Date().toISOString();
  const accountId = c.env.R2_ACCOUNT_ID;
  const accessKeyId = c.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = c.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new HTTPException(500, {
      message: "R2 upload signing is not configured",
    });
  }
  assertConfiguredR2AccountId(accountId);

  const uploadUrl = await createR2PutUrl({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: c.env.R2_BUCKET_NAME ?? DEFAULT_R2_BUCKET,
    key: r2Key,
    contentType: "image/png",
    contentLength: size,
  });

  await db
    .prepare(
      "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      materialId,
      parent.deck_id,
      "image",
      r2Key,
      filename,
      null,
      FILE_UPLOADING,
      createdAt,
    )
    .run();

  return c.json({ materialId, uploadUrl, r2Key });
});

/** Session-gated media fetch by R2 key (must belong to a material the user owns). */
materialRoutes.get("/media", async (c) => {
  const userId = await requireUser(c);
  const key = c.req.query("key")?.trim();
  if (!key) {
    throw new HTTPException(400, { message: "key query required" });
  }
  const db = getDb(c.env);
  const owned = await db
    .prepare(
      `SELECT m.r2_key FROM materials m
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE m.r2_key = ? AND d.user_id = ?`,
    )
    .bind(key, userId)
    .first<{ r2_key: string }>();
  if (!owned) {
    throw new HTTPException(404, { message: "Media not found" });
  }
  const obj = await c.env.MATERIALS.get(key);
  if (!obj) {
    throw new HTTPException(404, { message: "Media not found" });
  }
  const lower = key.toLowerCase();
  const contentType = lower.endsWith(".png")
    ? "image/png"
    : lower.endsWith(".webp")
      ? "image/webp"
      : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
        ? "image/jpeg"
        : "application/octet-stream";
  return new Response(obj.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=3600",
    },
  });
});

materialRoutes.post("/:id/complete", async (c) => {
  const userId = await requireUser(c);
  const materialId = c.req.param("id");
  const db = getDb(c.env);
  const material = await requireOwnedMaterial(db, materialId, userId);

  if (material.status === FILE_READY) {
    return c.json({
      id: material.id,
      deck_id: material.deck_id,
      kind: material.kind,
      r2_key: material.r2_key,
      filename: material.filename,
      page_count: material.page_count,
      status: material.status,
      created_at: material.created_at,
      jobId: null,
    });
  }

  let figureExtractMode: FigureExtractMode | undefined;
  let topicHints: string[] | null = null;
  let attachOnly = false;
  const rawBody = await c.req.text();
  if (rawBody.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new HTTPException(400, { message: "Invalid JSON body" });
    }
    const body = parsed as {
      figureExtractMode?: unknown;
      topicHints?: unknown;
      attachOnly?: unknown;
    };
    const rawMode = body.figureExtractMode;
    if (rawMode !== undefined) {
      if (rawMode !== "fast" && rawMode !== "accurate") {
        throw new HTTPException(400, {
          message: "Invalid figureExtractMode",
        });
      }
      figureExtractMode = rawMode;
    }
    try {
      topicHints = normalizeTopicHints(body.topicHints);
    } catch (err) {
      throw new HTTPException(400, {
        message: err instanceof Error ? err.message : "Invalid topicHints",
      });
    }
    if (body.attachOnly !== undefined && body.attachOnly !== false) {
      if (body.attachOnly !== true) {
        throw new HTTPException(400, { message: "Invalid attachOnly" });
      }
      attachOnly = true;
    }
  }

  const isFigure = material.r2_key?.includes("/figures/") ?? false;

  let contentHash: string | null = null;
  if (!isFigure && material.r2_key) {
    const obj = await c.env.MATERIALS.get(material.r2_key);
    if (obj) {
      contentHash = await sha256Hex(await obj.arrayBuffer());
      const hit = await findReadyMaterialByContentHash(
        db,
        material.deck_id,
        contentHash,
        materialId,
      );
      if (hit?.jobId) {
        await db
          .prepare("DELETE FROM materials WHERE id = ?")
          .bind(materialId)
          .run();
        if (material.r2_key) {
          await c.env.MATERIALS.delete(material.r2_key);
        }
        return c.json({
          id: hit.materialId,
          deck_id: hit.deck_id,
          kind: hit.kind,
          r2_key: hit.r2_key,
          filename: hit.filename,
          page_count: hit.page_count,
          status: hit.status,
          created_at: hit.created_at,
          jobId: hit.jobId,
          reused: true,
        });
      }
      if (hit && !hit.jobId) {
        await db
          .prepare("DELETE FROM materials WHERE id = ?")
          .bind(materialId)
          .run();
        if (material.r2_key) {
          await c.env.MATERIALS.delete(material.r2_key);
        }
        const jobId = await enqueueGeneration(c.env, {
          materialId: hit.materialId,
          deckId: material.deck_id,
          figureExtractMode,
          topicHints,
        });
        return c.json({
          id: hit.materialId,
          deck_id: hit.deck_id,
          kind: hit.kind,
          r2_key: hit.r2_key,
          filename: hit.filename,
          page_count: hit.page_count,
          status: hit.status,
          created_at: hit.created_at,
          jobId,
          reused: false,
        });
      }
    }
  }

  const cas = await db
    .prepare(
      "UPDATE materials SET status = ?, content_hash = ? WHERE id = ? AND status = ?",
    )
    .bind(FILE_READY, contentHash, materialId, FILE_UPLOADING)
    .run();
  if (!cas.meta.changes) {
    throw new HTTPException(409, {
      message: "Material is not awaiting upload completion",
    });
  }

  const jobId =
    isFigure || attachOnly
      ? null
      : await enqueueGeneration(c.env, {
        materialId,
        deckId: material.deck_id,
        figureExtractMode,
        topicHints,
      });

  return c.json({
    id: material.id,
    deck_id: material.deck_id,
    kind: material.kind,
    r2_key: material.r2_key,
    filename: material.filename,
    page_count: material.page_count,
    status: FILE_READY,
    created_at: material.created_at,
    jobId,
  });
});
