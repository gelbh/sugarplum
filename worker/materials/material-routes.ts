import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../db/client";
import { requireUser } from "../auth/session";
import {
  enqueueOrManualOcclusion,
  userHasByoSecret,
} from "../generation/image-free-path";
import {
  findReadyMaterialByContentHash,
  sha256Hex,
} from "./content-hash";
import { parseCompleteMaterialBody } from "./complete-body";
import { MAX_IMAGE_BYTES } from "./limits";
import { MAX_FIGURES_PER_PDF } from "./docling";
import {
  figureR2Key,
  figureR2KeyPrefixBounds,
  isFigureR2KeyForPdf,
} from "./figures";
import { assertReadyPdfForOcr, ocrResumeStartPage } from "./ocr-gates";
import { createR2GetUrl, createR2PutUrl } from "./r2-presign";
import {
  mergeOcrPages,
  OCR_PAGE_NUMBER_MAX,
  ocrRefillWindow,
  parseOcrPages,
  readOcrSidecar,
  writeOcrSidecar,
  type OcrPageText,
} from "./ocr-sidecar";
import { isSourceRole } from "../../src/lib/sourceRole";
import { refreshAtlasFocusForDeck } from "../atlas/focus";
import type { AppEnv } from "./types";
import { requireOwnedMaterial } from "./ownership";
import {
  DEFAULT_R2_BUCKET,
  FILE_READY,
  FILE_UPLOADING,
  OCR_REFETCH_EXPIRES_SEC,
  assertConfiguredR2AccountId,
  contentTypeForMaterial,
  newId,
  resolveSourceRole,
  sanitizeDownloadFilename,
} from "./upload";

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

  const sourceRole = resolveSourceRole(undefined, filename);

  await db
    .prepare(
      "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at, source_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
      sourceRole,
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

materialRoutes.get("/:id/download", async (c) => {
  const userId = await requireUser(c);
  const materialId = c.req.param("id");
  const db = getDb(c.env);
  const material = await requireOwnedMaterial(db, materialId, userId);
  const key = material.r2_key?.trim();
  if (!key) {
    throw new HTTPException(404, { message: "Material not found" });
  }
  const obj = await c.env.MATERIALS.get(key);
  if (!obj) {
    throw new HTTPException(404, { message: "Material not found" });
  }
  const filename = sanitizeDownloadFilename(material.filename);
  const contentType = contentTypeForMaterial(
    material.kind,
    key,
    material.filename,
  );
  return new Response(obj.body, {
    headers: {
      "content-type": contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, max-age=3600",
    },
  });
});

materialRoutes.delete("/:id", async (c) => {
  const userId = await requireUser(c);
  const materialId = c.req.param("id");
  const db = getDb(c.env);
  const material = await requireOwnedMaterial(db, materialId, userId);

  type FigureChild = { id: string; r2_key: string };
  let figureChildren: FigureChild[] = [];
  if (material.kind === "pdf") {
    const { lower, upper } = figureR2KeyPrefixBounds(
      material.deck_id,
      material.id,
    );
    const { results } = await db
      .prepare(
        `SELECT id, r2_key FROM materials
         WHERE deck_id = ? AND kind = 'image'
           AND r2_key >= ? AND r2_key < ?`,
      )
      .bind(material.deck_id, lower, upper)
      .all<{ id: string; r2_key: string }>();
    figureChildren = (results ?? []).filter(
      (row) =>
        typeof row.r2_key === "string" &&
        isFigureR2KeyForPdf(row.r2_key, material.deck_id, material.id),
    );
  }

  const keysToGuard = new Set<string>();
  const materialKey = material.r2_key?.trim();
  if (materialKey) keysToGuard.add(materialKey);
  for (const child of figureChildren) {
    keysToGuard.add(child.r2_key);
  }

  // Drop draft/rejected cards for this material's jobs before media guard so
  // figure-keyed drafts do not 409 a delete the UI says will remove them.
  const { results: jobRows } = await db
    .prepare("SELECT id FROM generation_jobs WHERE material_id = ?")
    .bind(material.id)
    .all<{ id: string }>();
  const jobIds = (jobRows ?? []).map((row) => row.id);
  if (jobIds.length > 0) {
    const placeholders = jobIds.map(() => "?").join(", ");
    await db
      .prepare(
        `DELETE FROM cards WHERE job_id IN (${placeholders}) AND status IN ('draft', 'rejected')`,
      )
      .bind(...jobIds)
      .run();
  }

  if (keysToGuard.size > 0) {
    const { results: cardMedia } = await db
      .prepare(
        "SELECT media_r2_keys_json FROM cards WHERE deck_id = ? AND media_r2_keys_json IS NOT NULL",
      )
      .bind(material.deck_id)
      .all<{ media_r2_keys_json: string }>();
    for (const row of cardMedia ?? []) {
      try {
        const parsed = JSON.parse(row.media_r2_keys_json) as unknown;
        if (!Array.isArray(parsed)) continue;
        for (const key of parsed) {
          if (typeof key === "string" && keysToGuard.has(key)) {
            throw new HTTPException(409, {
              message:
                "Material is referenced by card media and cannot be deleted",
            });
          }
        }
      } catch (err) {
        if (err instanceof HTTPException) throw err;
        /* ignore bad JSON */
      }
    }
  }

  for (const child of figureChildren) {
    await db.prepare("DELETE FROM materials WHERE id = ?").bind(child.id).run();
  }
  await db
    .prepare("DELETE FROM materials WHERE id = ?")
    .bind(material.id)
    .run();

  const r2Keys = new Set<string>(keysToGuard);
  for (const key of r2Keys) {
    try {
      await c.env.MATERIALS.delete(key);
    } catch {
      /* best-effort after D1 row removal */
    }
  }

  await refreshAtlasFocusForDeck(db, c.env, material.deck_id);

  return c.body(null, 204);
});

materialRoutes.get("/", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const { results } = await db
    .prepare(
      `SELECT m.id, m.deck_id, m.kind, m.r2_key, m.filename, m.page_count,
              m.status, m.created_at, m.source_role, d.title AS deck_title
       FROM materials m
       INNER JOIN decks d ON d.id = m.deck_id
       WHERE d.user_id = ?
       ORDER BY m.created_at DESC`,
    )
    .bind(userId)
    .all();
  return c.json(results ?? []);
});

materialRoutes.patch("/:id", async (c) => {
  const userId = await requireUser(c);
  const materialId = c.req.param("id");
  const db = getDb(c.env);
  const material = await requireOwnedMaterial(db, materialId, userId);

  let body: { source_role?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  if (!isSourceRole(body.source_role)) {
    throw new HTTPException(400, { message: "Valid source_role required" });
  }
  const sourceRole = body.source_role;

  await db
    .prepare("UPDATE materials SET source_role = ? WHERE id = ?")
    .bind(sourceRole, materialId)
    .run();

  await refreshAtlasFocusForDeck(db, c.env, material.deck_id);

  return c.json({
    id: material.id,
    deck_id: material.deck_id,
    kind: material.kind,
    r2_key: material.r2_key,
    filename: material.filename,
    page_count: material.page_count,
    status: material.status,
    created_at: material.created_at,
    source_role: sourceRole,
  });
});

materialRoutes.post("/:id/complete", async (c) => {
  const userId = await requireUser(c);
  const materialId = c.req.param("id");
  const db = getDb(c.env);
  const material = await requireOwnedMaterial(db, materialId, userId);

  if (material.status === FILE_READY) {
    const manual_occlusion =
      material.kind === "image" &&
      !(await userHasByoSecret(db, userId));
    return c.json({
      id: material.id,
      deck_id: material.deck_id,
      kind: material.kind,
      r2_key: material.r2_key,
      filename: material.filename,
      page_count: material.page_count,
      status: material.status,
      created_at: material.created_at,
      source_role: material.source_role ?? "lecture",
      jobId: null,
      ...(manual_occlusion ? { manual_occlusion: true } : {}),
    });
  }

  const rawBody = await c.req.text();
  const { figureExtractMode, topicHints, attachOnly, ocrPages } =
    parseCompleteMaterialBody(rawBody, material.kind);

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
          source_role: hit.source_role ?? "lecture",
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
        const { jobId, manual_occlusion } = await enqueueOrManualOcclusion(
          c.env,
          db,
          {
            userId,
            kind: hit.kind,
            materialId: hit.materialId,
            deckId: material.deck_id,
            figureExtractMode,
            topicHints,
          },
        );
        return c.json({
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
          ...(manual_occlusion ? { manual_occlusion: true } : {}),
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

  if (ocrPages && material.kind === "pdf") {
    try {
      await writeOcrSidecar(c.env, material.deck_id, materialId, ocrPages, []);
    } catch (err) {
      console.warn("OCR sidecar write failed", err);
    }
  }

  let jobId: string | null = null;
  let manual_occlusion = false;
  if (!isFigure && !attachOnly) {
    const result = await enqueueOrManualOcclusion(c.env, db, {
      userId,
      kind: material.kind,
      materialId,
      deckId: material.deck_id,
      figureExtractMode,
      topicHints,
    });
    jobId = result.jobId;
    manual_occlusion = result.manual_occlusion;
  }

  await refreshAtlasFocusForDeck(db, c.env, material.deck_id);

  return c.json({
    id: material.id,
    deck_id: material.deck_id,
    kind: material.kind,
    r2_key: material.r2_key,
    filename: material.filename,
    page_count: material.page_count,
    status: FILE_READY,
    created_at: material.created_at,
    source_role: material.source_role ?? "lecture",
    jobId,
    ...(manual_occlusion ? { manual_occlusion: true } : {}),
  });
});

materialRoutes.post("/:id/ocr-refetch", async (c) => {
  const userId = await requireUser(c);
  const materialId = c.req.param("id");
  const db = getDb(c.env);
  const material = await requireOwnedMaterial(db, materialId, userId);
  const r2Key = assertReadyPdfForOcr(material);
  const resumeStart = await ocrResumeStartPage(db, material.id);
  const window = ocrRefillWindow(resumeStart);
  const pastCeiling =
    Number.isInteger(resumeStart) && resumeStart > OCR_PAGE_NUMBER_MAX;
  if (!window && !pastCeiling) return c.json({ refill: false });

  const accountId = c.env.R2_ACCOUNT_ID;
  const accessKeyId = c.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = c.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new HTTPException(500, {
      message: "R2 upload signing is not configured",
    });
  }
  assertConfiguredR2AccountId(accountId);

  const downloadUrl = await createR2GetUrl({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: c.env.R2_BUCKET_NAME ?? DEFAULT_R2_BUCKET,
    key: r2Key,
    expiresIn: OCR_REFETCH_EXPIRES_SEC,
  });
  const sidecar = await readOcrSidecar(c.env, material.deck_id, material.id);
  const coveredPages = (sidecar?.pages ?? []).map((page) => page.page);

  return c.json({
    refill: true,
    downloadUrl,
    expiresIn: OCR_REFETCH_EXPIRES_SEC,
    startPage: window ? window.start : resumeStart,
    windowEnd: window ? window.end : OCR_PAGE_NUMBER_MAX,
    coveredPages,
  });
});

materialRoutes.post("/:id/ocr-pages", async (c) => {
  const userId = await requireUser(c);
  const materialId = c.req.param("id");
  const db = getDb(c.env);
  const material = await requireOwnedMaterial(db, materialId, userId);
  assertReadyPdfForOcr(material);

  let rawPages: unknown;
  try {
    const body = (await c.req.json()) as { pages?: unknown };
    rawPages = body?.pages;
  } catch {
    throw new HTTPException(400, { message: "Invalid ocrPages" });
  }

  let incoming: OcrPageText[] | undefined;
  try {
    incoming = parseOcrPages(rawPages);
  } catch {
    throw new HTTPException(400, { message: "Invalid ocrPages" });
  }
  if (!incoming) {
    throw new HTTPException(400, { message: "Invalid ocrPages" });
  }

  const resumeStart = await ocrResumeStartPage(db, material.id);
  const sidecar = await readOcrSidecar(c.env, material.deck_id, material.id);
  const previous = sidecar?.pages ?? [];
  const previousUnstudied = sidecar?.unstudiedPages ?? [];
  let merged: OcrPageText[];
  try {
    merged = mergeOcrPages(previous, incoming, {
      start: 1,
      end: OCR_PAGE_NUMBER_MAX,
    });
  } catch {
    throw new HTTPException(400, { message: "Invalid ocrPages" });
  }

  const previousPageNums = new Set(previous.map((page) => page.page));
  const newlyUnstudied: number[] = [];
  for (const page of incoming) {
    if (previousPageNums.has(page.page)) continue;
    if (page.page >= resumeStart) continue;
    newlyUnstudied.push(page.page);
  }
  const nextUnstudied = [
    ...new Set([...previousUnstudied, ...newlyUnstudied]),
  ].sort((a, b) => a - b);
  const unstudiedGrew = nextUnstudied.length > previousUnstudied.length;

  if (merged.length > previous.length || unstudiedGrew) {
    await writeOcrSidecar(
      c.env,
      material.deck_id,
      material.id,
      merged,
      nextUnstudied,
    );
    await refreshAtlasFocusForDeck(db, c.env, material.deck_id);
  }
  return c.json({ stored: merged.length });
});
