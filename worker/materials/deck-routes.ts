import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../db/client";
import { requireUser } from "../auth/session";
import { filterDeletableR2Keys } from "../admin/sandbox-r2";
import { enqueueGeneration } from "../generation/enqueue";
import {
  IMAGE_MANUAL_OCCLUSION_MESSAGE,
  userHasByoSecret,
} from "../generation/image-free-path";
import { normalizeTopicHints } from "../generation/topic-hints";
import { findReadyMaterialByContentHash, sha256Hex } from "./content-hash";
import {
  assertSingleCloze,
  assertValidMcqOptions,
} from "../generation/schema";
import { encodeStoredBack, serializeCard, type CardRow } from "../cards/routes";
import { newCard, scheduleColumnsFromCard } from "../study/fsrs";
import { composeSubjectKnowledge } from "../../src/study/subjectKnowledge";
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES } from "./limits";
import {
  assertDeckMaterialKeys,
  HubCreateCardSchema,
} from "./hub-create-card";
import { parsePasteMaterialBody } from "./paste-material";
import { createR2PutUrl } from "./r2-presign";
import { refreshAtlasFocusForDeck } from "../atlas/focus";
import type { AppEnv, MaterialRow } from "./types";
import {
  deckJson,
  requireOwnedDeck,
  requireOwnedMaterial,
  requireOwnedSubjectId,
} from "./ownership";
import { listFigureKeysInR2 } from "./figures";
import {
  DEFAULT_R2_BUCKET,
  FILE_READY,
  FILE_UPLOADING,
  PASTE_READY,
  PPTX_CONTENT_TYPE,
  assertConfiguredR2AccountId,
  newId,
  resolveSourceRole,
  resolveUpload,
} from "./upload";

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

deckRoutes.get("/:id/materials", async (c) => {
  const userId = await requireUser(c);
  const deckId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedDeck(db, deckId, userId);
  const { results } = await db
    .prepare(
      `SELECT id, deck_id, kind, r2_key, filename, page_count, status, created_at, source_role
       FROM materials
       WHERE deck_id = ?
         AND (r2_key IS NULL OR instr(r2_key, '/figures/') = 0)
       ORDER BY created_at DESC`,
    )
    .bind(deckId)
    .all();
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
    .prepare(
      `SELECT COUNT(*) AS count FROM materials
       WHERE deck_id = ?
         AND (r2_key IS NULL OR instr(r2_key, '/figures/') = 0)`,
    )
    .bind(deckId)
    .first<{ count: number }>();

  return c.json({
    accepted: accepted?.count ?? 0,
    draft: draft?.count ?? 0,
    archived: archived?.count ?? 0,
    materials: materials?.count ?? 0,
  });
});

deckRoutes.get("/:id/composition", async (c) => {
  const userId = await requireUser(c);
  const deckId = c.req.param("id");
  const db = getDb(c.env);
  await requireOwnedDeck(db, deckId, userId);

  const { results } = await db
    .prepare(
      `-- sugarplum:deck-composition
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
       LEFT JOIN card_schedules s ON s.card_id = c.id
       WHERE c.deck_id = ? AND c.status = 'accepted'`,
    )
    .bind(deckId)
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
  const { results: materialRows } = await db
    .prepare("SELECT id, kind, r2_key FROM materials WHERE deck_id = ?")
    .bind(deckId)
    .all<{ id: string; kind: string; r2_key: string | null }>();
  for (const row of materialRows ?? []) {
    if (row.r2_key) keys.add(row.r2_key);
  }
  for (const row of materialRows ?? []) {
    if (row.kind !== "pdf") continue;
    for (const key of await listFigureKeysInR2(c.env.MATERIALS, {
      deckId,
      pdfMaterialId: row.id,
    })) {
      keys.add(key);
    }
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

  for (const key of await filterDeletableR2Keys(db, userId, keys)) {
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

  let body: {
    text?: unknown;
    filename?: unknown;
    topicHints?: unknown;
    source_role?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const { text, topicHints, filename, sourceRole } =
    parsePasteMaterialBody(body);

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
        source_role: hit.source_role ?? "lecture",
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
        source_role: hit.source_role ?? "lecture",
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
      "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at, content_hash, source_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
      sourceRole,
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
    source_role: sourceRole,
  };

  await refreshAtlasFocusForDeck(db, c.env, deckId);

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
    const material = await requireOwnedMaterial(db, explicitMaterialId, userId);
    if (material.deck_id !== deckId) {
      throw new HTTPException(404, { message: "Material not found" });
    }
    if (material.kind === "image" && material.status === FILE_READY) {
      if (!(await userHasByoSecret(db, userId))) {
        throw new HTTPException(422, {
          message: IMAGE_MANUAL_OCCLUSION_MESSAGE,
        });
      }
      materialId = material.id;
    } else if (
      (material.kind === "paste" || material.kind === "pdf") &&
      material.status === PASTE_READY
    ) {
      materialId = material.id;
    } else {
      throw new HTTPException(422, {
        message: "No material available for topic generation",
      });
    }
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

  let body: {
    filename?: unknown;
    contentType?: unknown;
    size?: unknown;
    source_role?: unknown;
  };
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
    throw new HTTPException(400, {
      message: `File must be ${MAX_FILE_BYTES / (1024 * 1024)}MB or smaller`,
    });
  }
  if (resolved.kind === "image" && size > MAX_IMAGE_BYTES) {
    throw new HTTPException(400, {
      message: `Images for generation must be ${MAX_IMAGE_BYTES / (1024 * 1024)}MB or smaller`,
    });
  }

  const defaultName = `upload.${resolved.ext}`;
  const filename = filenameHint || defaultName;
  const sourceRole = resolveSourceRole(body.source_role, filename);
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
      "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at, source_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
      sourceRole,
    )
    .run();

  return c.json({ materialId, uploadUrl, r2Key });
});
