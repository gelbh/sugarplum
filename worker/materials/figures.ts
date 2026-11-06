import type { Env } from "../env";
import type { FigureCrop, FigureMime } from "./docling";
import { MAX_FIGURES_PER_PDF } from "./docling";

export function figureExtForMime(mime: FigureMime): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

export function figureR2Key(
  deckId: string,
  pdfMaterialId: string,
  index: number,
  mime: FigureMime = "image/png",
): string {
  return `materials/${deckId}/figures/${pdfMaterialId}/${index}.${figureExtForMime(mime)}`;
}

/**
 * Half-open prefix range for figure children under a PDF.
 * D1 rejects LIKE/GLOB patterns longer than 50 bytes; UUID prefixes are ~93.
 * Range `[lower, upper)` matches `lower*` without LIKE (`/` < `0` in ASCII).
 */
export function figureR2KeyPrefixBounds(
  deckId: string,
  pdfMaterialId: string,
): { lower: string; upper: string } {
  const stem = `materials/${deckId}/figures/${pdfMaterialId}`;
  return { lower: `${stem}/`, upper: `${stem}0` };
}

export function isFigureR2KeyForPdf(
  r2Key: string,
  deckId: string,
  pdfMaterialId: string,
): boolean {
  const { lower: prefix } = figureR2KeyPrefixBounds(deckId, pdfMaterialId);
  if (!r2Key.startsWith(prefix)) return false;
  const rest = r2Key.slice(prefix.length);
  return /^[0-9]+\.(png|jpe?g|webp)$/i.test(rest);
}

export function mimeFromR2Key(r2Key: string): string {
  const lower = r2Key.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

/** Chunked so large images do not blow the call stack via spread. */
export function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < arr.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, arr.length);
    for (let j = i; j < end; j++) {
      binary += String.fromCharCode(arr[j]!);
    }
  }
  return btoa(binary);
}

type FigureChildRow = { r2_key: string; status: string };

/** Child figure materials under a PDF prefix (uploading and/or ready). */
export async function listFigureChildrenForPdf(
  db: D1Database,
  args: { deckId: string; pdfMaterialId: string },
): Promise<FigureChildRow[]> {
  const { lower, upper } = figureR2KeyPrefixBounds(
    args.deckId,
    args.pdfMaterialId,
  );
  const { results } = await db
    .prepare(
      `SELECT r2_key, status FROM materials
       WHERE deck_id = ? AND kind = 'image'
         AND r2_key >= ? AND r2_key < ?
         AND status IN ('ready', 'uploading')
       ORDER BY r2_key ASC`,
    )
    .bind(args.deckId, lower, upper)
    .all<{ r2_key: string; status: string }>();

  return (results ?? []).filter(
    (row) =>
      typeof row.r2_key === "string" &&
      isFigureR2KeyForPdf(row.r2_key, args.deckId, args.pdfMaterialId),
  );
}

export async function listFigureR2KeysForPdf(
  db: D1Database,
  args: { deckId: string; pdfMaterialId: string },
): Promise<string[]> {
  const children = await listFigureChildrenForPdf(db, args);
  return children
    .filter((row) => row.status === "ready")
    .map((row) => row.r2_key)
    .slice(0, MAX_FIGURES_PER_PDF);
}

export async function hasUploadingFigureChildren(
  db: D1Database,
  args: { deckId: string; pdfMaterialId: string },
): Promise<boolean> {
  const children = await listFigureChildrenForPdf(db, args);
  return children.some((row) => row.status === "uploading");
}

export type PersistedFigure = { r2Key: string; crop: FigureCrop };

export async function persistFigureCrops(
  env: Env,
  args: {
    deckId: string;
    pdfMaterialId: string;
    crops: FigureCrop[];
  },
): Promise<PersistedFigure[]> {
  const existing = await listFigureChildrenForPdf(env.DB, {
    deckId: args.deckId,
    pdfMaterialId: args.pdfMaterialId,
  });
  const existingKeys = new Set(existing.map((row) => row.r2_key));

  const persisted: PersistedFigure[] = [];
  const now = new Date().toISOString();

  for (const crop of args.crops.slice(0, MAX_FIGURES_PER_PDF)) {
    const key = figureR2Key(
      args.deckId,
      args.pdfMaterialId,
      crop.index,
      crop.mimeType,
    );
    // Skip when a client crop (ready or still uploading) already owns this key.
    if (existingKeys.has(key)) continue;

    await env.MATERIALS.put(key, crop.bytes, {
      httpMetadata: { contentType: crop.mimeType },
    });
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        args.deckId,
        "image",
        key,
        `figure-p${crop.page}-${crop.index}.${figureExtForMime(crop.mimeType)}`,
        null,
        "ready",
        now,
      )
      .run();
    existingKeys.add(key);
    persisted.push({ r2Key: key, crop });
  }

  return persisted;
}
