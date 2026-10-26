import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import { requireUser, type AuthVariables } from "../auth/session";
import { createR2PutUrl } from "./r2-presign";

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
const PDF_UPLOADING = "uploading";
const PDF_READY = "ready";
const PDF_CONTENT_TYPE = "application/pdf";
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const DEFAULT_R2_BUCKET = "sugarplum-materials";

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
      "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, deckId, "paste", r2Key, filename, null, PASTE_READY, createdAt)
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
  if (contentType !== PDF_CONTENT_TYPE) {
    throw new HTTPException(400, {
      message: "Only application/pdf is allowed",
    });
  }

  const size = typeof body.size === "number" ? body.size : Number(body.size);
  if (!Number.isFinite(size) || size <= 0) {
    throw new HTTPException(400, { message: "Valid size required" });
  }
  if (size > MAX_PDF_BYTES) {
    throw new HTTPException(400, { message: "PDF must be 25MB or smaller" });
  }

  const filename =
    typeof body.filename === "string" && body.filename.trim()
      ? body.filename.trim()
      : "upload.pdf";

  const materialId = newId();
  const createdAt = new Date().toISOString();
  const r2Key = `materials/${deckId}/${materialId}.pdf`;

  const accountId = c.env.R2_ACCOUNT_ID;
  const accessKeyId = c.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = c.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new HTTPException(500, {
      message: "R2 upload signing is not configured",
    });
  }

  const uploadUrl = await createR2PutUrl({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: c.env.R2_BUCKET_NAME ?? DEFAULT_R2_BUCKET,
    key: r2Key,
    contentType: PDF_CONTENT_TYPE,
  });

  await db
    .prepare(
      "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      materialId,
      deckId,
      "pdf",
      r2Key,
      filename,
      null,
      PDF_UPLOADING,
      createdAt,
    )
    .run();

  return c.json({ materialId, uploadUrl, r2Key });
});

export const materialRoutes = new Hono<AppEnv>();

materialRoutes.post("/:id/complete", async (c) => {
  const userId = await requireUser(c);
  const materialId = c.req.param("id");
  const db = getDb(c.env);
  const material = await requireOwnedMaterial(db, materialId, userId);

  if (material.status === PDF_READY) {
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

  await db
    .prepare("UPDATE materials SET status = ? WHERE id = ?")
    .bind(PDF_READY, materialId)
    .run();

  const jobId = newId();
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO generation_jobs (id, material_id, status, error, coverage_json, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(jobId, materialId, "queued", null, null, createdAt, null)
    .run();

  if (c.env.GENERATE_QUEUE) {
    await c.env.GENERATE_QUEUE.send({
      jobId,
      materialId,
      deckId: material.deck_id,
    });
  }

  return c.json({
    id: material.id,
    deck_id: material.deck_id,
    kind: material.kind,
    r2_key: material.r2_key,
    filename: material.filename,
    page_count: material.page_count,
    status: PDF_READY,
    created_at: material.created_at,
    jobId,
  });
});
