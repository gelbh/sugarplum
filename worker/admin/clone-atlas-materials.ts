/** Copy atlas_materials rows + R2 body/OCR into a sandbox atlas. */

import type { Env } from "../env";
import { applySandboxKeyPrefix } from "./sandbox-r2";

type IdMap = Map<string, string>;

function mapId(map: IdMap, oldId: string): string {
  const existing = map.get(oldId);
  if (existing) return existing;
  const id = crypto.randomUUID();
  map.set(oldId, id);
  return id;
}

const BATCH = 40;

async function runBatches(
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<void> {
  for (let i = 0; i < statements.length; i += BATCH) {
    await db.batch(statements.slice(i, i + BATCH));
  }
}

/**
 * Clone pack materials for one atlas. Mutates `atlasMaterialMap` with
 * source→dest material ids. Never retains source `r2_key` on sandbox rows.
 */
export async function cloneAtlasMaterials(
  db: D1Database,
  env: Env,
  args: {
    sourceAtlasId: string;
    destAtlasId: string;
    sandboxUserId: string;
    atlasMaterialMap: IdMap;
  },
): Promise<void> {
  const { sourceAtlasId, destAtlasId, sandboxUserId, atlasMaterialMap } = args;

  const { results: packRows } = await db
    .prepare(
      `SELECT id, atlas_id, kind, r2_key, filename, page_count, status,
              created_at, content_hash, source_role
       FROM atlas_materials WHERE atlas_id = ?
       ORDER BY created_at ASC`.replace(/\s+/g, " "),
    )
    .bind(sourceAtlasId)
    .all<{
      id: string;
      atlas_id: string;
      kind: string;
      r2_key: string | null;
      filename: string | null;
      page_count: number | null;
      status: string;
      created_at: string;
      content_hash: string | null;
      source_role: string;
    }>();

  const packStmts: D1PreparedStatement[] = [];
  for (const row of packRows ?? []) {
    const materialId = mapId(atlasMaterialMap, row.id);
    // Never keep the source user's R2 key on the sandbox row: a later
    // delete would target production objects if get() missed a race.
    let r2Key: string | null = null;
    if (row.r2_key) {
      const src = await env.MATERIALS.get(row.r2_key);
      if (src) {
        const ext =
          row.kind === "paste"
            ? "txt"
            : row.kind === "pptx"
              ? "pptx"
              : "pdf";
        r2Key = applySandboxKeyPrefix(
          sandboxUserId,
          `atlas/${destAtlasId}/${materialId}.${ext}`,
        );
        await env.MATERIALS.put(r2Key, await src.arrayBuffer(), {
          httpMetadata: src.httpMetadata,
        });
      }
    }
    if (row.kind === "pdf") {
      const ocrKey = `atlas/${sourceAtlasId}/ocr/${row.id}.json`;
      const ocrObj = await env.MATERIALS.get(ocrKey);
      if (ocrObj) {
        const destOcr = applySandboxKeyPrefix(
          sandboxUserId,
          `atlas/${destAtlasId}/ocr/${materialId}.json`,
        );
        await env.MATERIALS.put(destOcr, await ocrObj.arrayBuffer(), {
          httpMetadata: ocrObj.httpMetadata,
        });
      }
    }
    packStmts.push(
      db
        .prepare(
          `INSERT INTO atlas_materials (
             id, atlas_id, kind, r2_key, filename, page_count, status,
             created_at, content_hash, source_role
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`.replace(/\s+/g, " "),
        )
        .bind(
          materialId,
          destAtlasId,
          row.kind,
          r2Key,
          row.filename,
          row.page_count,
          row.status,
          row.created_at,
          row.content_hash,
          row.source_role,
        ),
    );
  }
  await runBatches(db, packStmts);
}
