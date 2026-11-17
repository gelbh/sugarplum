import type { Env } from "../env";
import {
  applySandboxKeyPrefix,
  stripSandboxKeyPrefix,
} from "../admin/sandbox-r2";
import type { FigureCrop, FigureMime } from "./docling";
import { MAX_FIGURES_PER_PDF } from "./docling";

const FIGURE_MIMES: FigureMime[] = ["image/png", "image/jpeg", "image/webp"];

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
  sandboxUserId?: string | null,
): string {
  return applySandboxKeyPrefix(
    sandboxUserId,
    `materials/${deckId}/figures/${pdfMaterialId}/${index}.${figureExtForMime(mime)}`,
  );
}

/**
 * Half-open prefix range for figure children under a PDF.
 * D1 rejects LIKE/GLOB patterns longer than 50 bytes; UUID prefixes are ~93.
 * Range `[lower, upper)` matches `lower*` without LIKE (`/` < `0` in ASCII).
 */
export function figureR2KeyPrefixBounds(
  deckId: string,
  pdfMaterialId: string,
  sandboxUserId?: string | null,
): { lower: string; upper: string } {
  const stem = applySandboxKeyPrefix(
    sandboxUserId,
    `materials/${deckId}/figures/${pdfMaterialId}`,
  );
  return { lower: `${stem}/`, upper: `${stem}0` };
}

export function isFigureR2KeyForPdf(
  r2Key: string,
  deckId: string,
  pdfMaterialId: string,
): boolean {
  const logical = stripSandboxKeyPrefix(r2Key);
  const { lower: prefix } = figureR2KeyPrefixBounds(deckId, pdfMaterialId);
  if (!logical.startsWith(prefix)) return false;
  const rest = logical.slice(prefix.length);
  return /^[0-9]+\.(png|jpe?g|webp)$/i.test(rest);
}

/** True when the key is a PDF/PPTX figure crop under materials/{deck}/figures/… */
export function isFigureMaterialKey(r2Key: string | null | undefined): boolean {
  return typeof r2Key === "string" && r2Key.includes("/figures/");
}

/**
 * Parse `materials/{deckId}/figures/{pdfMaterialId}/{n}.{ext}`.
 * Returns null when the key is not a figure crop path.
 */
export function parseFigureR2Key(
  r2Key: string,
): { deckId: string; pdfMaterialId: string } | null {
  const match =
    /^materials\/([^/]+)\/figures\/([^/]+)\/\d+\.(?:png|jpe?g|webp)$/i.exec(
      stripSandboxKeyPrefix(r2Key),
    );
  if (!match) return null;
  return { deckId: match[1]!, pdfMaterialId: match[2]! };
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

/**
 * Probe R2 for figure objects at known index/mime slots.
 * ponytail: O(MAX×3) heads per index (sandbox + bare when impersonating); list-prefix scan is the upgrade.
 */
type FigurePdfArgs = {
  deckId: string;
  pdfMaterialId: string;
  sandboxUserId?: string | null;
};

export async function listFigureKeysInR2(
  materials: R2Bucket,
  args: FigurePdfArgs,
): Promise<string[]> {
  const keys: string[] = [];
  for (let index = 0; index < MAX_FIGURES_PER_PDF; index++) {
    for (const mime of FIGURE_MIMES) {
      const bare = figureR2Key(args.deckId, args.pdfMaterialId, index, mime);
      const candidates =
        args.sandboxUserId != null
          ? [figureR2Key(args.deckId, args.pdfMaterialId, index, mime, args.sandboxUserId), bare]
          : [bare];
      let found: string | null = null;
      for (const key of candidates) {
        const hit = await materials.head(key);
        if (hit) {
          found = key;
          break;
        }
      }
      if (found) {
        keys.push(found);
        break;
      }
    }
  }
  return keys;
}

/** Legacy figure material rows (uploading/ready) still under the PDF prefix. */
async function listLegacyFigureMaterialRows(
  db: D1Database,
  args: FigurePdfArgs,
): Promise<FigureChildRow[]> {
  const ranges = [figureR2KeyPrefixBounds(args.deckId, args.pdfMaterialId)];
  if (args.sandboxUserId != null) {
    ranges.push(
      figureR2KeyPrefixBounds(
        args.deckId,
        args.pdfMaterialId,
        args.sandboxUserId,
      ),
    );
  }
  const byKey = new Map<string, FigureChildRow>();
  for (const { lower, upper } of ranges) {
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
    for (const row of results ?? []) {
      if (
        typeof row.r2_key === "string" &&
        isFigureR2KeyForPdf(row.r2_key, args.deckId, args.pdfMaterialId)
      ) {
        byKey.set(row.r2_key, row);
      }
    }
  }
  return [...byKey.values()];
}

/**
 * Figure children for a PDF: R2 objects (preferred) plus any legacy materials rows.
 * Uploading legacy rows still block Docling so in-flight client puts are respected.
 */
export async function listFigureChildrenForPdf(
  env: Pick<Env, "DB" | "MATERIALS">,
  args: FigurePdfArgs,
): Promise<FigureChildRow[]> {
  const legacy = await listLegacyFigureMaterialRows(env.DB, args);
  const byKey = new Map<string, FigureChildRow>();
  for (const row of legacy) {
    byKey.set(row.r2_key, row);
  }

  const r2Keys = await listFigureKeysInR2(env.MATERIALS, args);
  for (const key of r2Keys) {
    if (!byKey.has(key)) {
      byKey.set(key, { r2_key: key, status: "ready" });
    }
  }

  return [...byKey.values()].sort((a, b) => a.r2_key.localeCompare(b.r2_key));
}

export async function listFigureR2KeysForPdf(
  env: Pick<Env, "DB" | "MATERIALS">,
  args: FigurePdfArgs,
): Promise<string[]> {
  const children = await listFigureChildrenForPdf(env, args);
  return children
    .filter((row) => row.status === "ready")
    .map((row) => row.r2_key)
    .slice(0, MAX_FIGURES_PER_PDF);
}

export async function hasUploadingFigureChildren(
  env: Pick<Env, "DB" | "MATERIALS">,
  args: FigurePdfArgs,
): Promise<boolean> {
  const children = await listFigureChildrenForPdf(env, args);
  return children.some((row) => row.status === "uploading");
}

export type PersistedFigure = { r2Key: string; crop: FigureCrop };

/**
 * Store Docling crops in R2 only (no materials rows).
 * Generation reads keys from R2; Browse files never lists figure objects.
 */
export async function persistFigureCrops(
  env: Env,
  args: {
    deckId: string;
    pdfMaterialId: string;
    crops: FigureCrop[];
    sandboxUserId?: string | null;
  },
): Promise<PersistedFigure[]> {
  const existing = await listFigureChildrenForPdf(env, {
    deckId: args.deckId,
    pdfMaterialId: args.pdfMaterialId,
    sandboxUserId: args.sandboxUserId,
  });
  const existingKeys = new Set(existing.map((row) => row.r2_key));

  const persisted: PersistedFigure[] = [];

  for (const crop of args.crops.slice(0, MAX_FIGURES_PER_PDF)) {
    const key = figureR2Key(
      args.deckId,
      args.pdfMaterialId,
      crop.index,
      crop.mimeType,
      args.sandboxUserId,
    );
    // Skip when a client crop (ready or still uploading) already owns this key.
    if (existingKeys.has(key)) continue;

    await env.MATERIALS.put(key, crop.bytes, {
      httpMetadata: { contentType: crop.mimeType },
    });
    existingKeys.add(key);
    persisted.push({ r2Key: key, crop });
  }

  return persisted;
}
