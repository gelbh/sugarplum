import type { Env } from "../env";
import {
  readAtlasOcrSidecar,
  writeAtlasOcrSidecar,
} from "../materials/ocr-sidecar";

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
 * source→dest material ids. Keeps source `r2_key` (read-through), same as
 * deck materials: sandbox deletes use `filterDeletableR2Keys` and never
 * remove non-prefixed keys. Avoids byte-copying course-pack PDFs on
 * impersonate (Worker timeout / 500 with large packs).
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
  const { sourceAtlasId, destAtlasId, atlasMaterialMap } = args;

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
    if (row.kind === "pdf" || row.kind === "pptx") {
      try {
        const sidecar = await readAtlasOcrSidecar(env, sourceAtlasId, row.id);
        if (sidecar?.pages.length) {
          await writeAtlasOcrSidecar(
            env,
            destAtlasId,
            materialId,
            sidecar.pages,
            {
              unstudiedPages: sidecar.unstudiedPages ?? [],
              sourceContentHash: sidecar.sourceContentHash,
            },
          );
        }
      } catch {
        /* best-effort OCR clone */
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
          row.r2_key,
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
