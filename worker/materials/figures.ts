import type { Env } from "../env";
import type { FigureCrop } from "./docling";

const FIGURE_READY = "ready";

export function figureR2Key(
  deckId: string,
  pdfMaterialId: string,
  index: number,
): string {
  return `materials/${deckId}/figures/${pdfMaterialId}/${index}.png`;
}

function figureFilename(crop: FigureCrop): string {
  return `figure-p${crop.page}-${crop.index}.png`;
}

export async function persistFigureCrops(
  env: Env,
  args: { deckId: string; pdfMaterialId: string; crops: FigureCrop[] },
): Promise<{ r2Key: string; materialId: string; crop: FigureCrop }[]> {
  const { deckId, pdfMaterialId, crops } = args;
  const createdAt = new Date().toISOString();
  const out: { r2Key: string; materialId: string; crop: FigureCrop }[] = [];

  for (const crop of crops) {
    const r2Key = figureR2Key(deckId, pdfMaterialId, crop.index);
    await env.MATERIALS.put(r2Key, crop.bytes, {
      httpMetadata: { contentType: crop.mimeType },
    });

    const materialId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO materials (id, deck_id, kind, r2_key, filename, page_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        materialId,
        deckId,
        "image",
        r2Key,
        figureFilename(crop),
        null,
        FIGURE_READY,
        createdAt,
      )
      .run();

    out.push({ r2Key, materialId, crop });
  }

  return out;
}

export async function listFigureR2KeysForPdf(
  db: D1Database,
  args: { deckId: string; pdfMaterialId: string },
): Promise<string[]> {
  const prefix = `materials/${args.deckId}/figures/${args.pdfMaterialId}/`;
  const { results } = await db
    .prepare(
      "SELECT r2_key FROM materials WHERE deck_id = ? AND kind = 'image' AND status = 'ready' AND r2_key LIKE ? ORDER BY r2_key",
    )
    .bind(args.deckId, `${prefix}%`)
    .all<{ r2_key: string | null }>();

  return results
    .map((row) => row.r2_key)
    .filter((key): key is string => typeof key === "string" && key.length > 0);
}
