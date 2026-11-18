import type { Env } from "../env";
import {
  isSourceRole,
  type SourceRole,
} from "../../src/lib/sourceRole";
import {
  type FocusMaterial,
} from "../../src/atlas/focusScan";
import { extractPptxSlides } from "../materials/extract-pptx";
import {
  OCR_PAGE_CHAR_CAP,
  readAtlasOcrSidecar,
  writeAtlasOcrSidecar,
} from "../materials/ocr-sidecar";

export type AtlasMaterialScanRow = {
  id: string;
  atlas_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  source_role: string;
  status: string;
};

const READY_STATUS = "ready";
const SCAN_KINDS = new Set(["pdf", "paste", "pptx"]);

export async function loadAtlasMaterialRows(
  db: D1Database,
  atlasId: string,
): Promise<AtlasMaterialScanRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, atlas_id, kind, r2_key, filename, source_role, status
       FROM atlas_materials
       WHERE atlas_id = ?`,
    )
    .bind(atlasId)
    .all<AtlasMaterialScanRow>();
  return (results ?? []).filter(
    (m) => SCAN_KINDS.has(m.kind) && m.status === READY_STATUS,
  );
}

async function loadPptxPages(
  env: Env,
  row: AtlasMaterialScanRow,
): Promise<FocusMaterial["pages"]> {
  const pages: FocusMaterial["pages"] = [];
  const sidecar = await readAtlasOcrSidecar(env, row.atlas_id, row.id);
  if (sidecar?.pages.length) {
    for (const p of sidecar.pages) {
      pages.push({ page: p.page, text: p.text });
    }
    return pages;
  }
  if (!row.r2_key) return pages;
  try {
    const obj = await env.MATERIALS.get(row.r2_key);
    if (!obj) return pages;
    const extracted = await extractPptxSlides(await obj.arrayBuffer());
    const extractedPages = extracted.pages.map((p) => ({
      page: p.page,
      text: p.text.slice(0, OCR_PAGE_CHAR_CAP),
    }));
    if (extractedPages.some((p) => p.text.trim())) {
      try {
        await writeAtlasOcrSidecar(env, row.atlas_id, row.id, extractedPages);
      } catch (err) {
        console.warn("atlas PPTX Focus sidecar backfill failed", err);
      }
      for (const p of extractedPages) {
        pages.push({ page: p.page, text: p.text });
      }
    }
  } catch {
    /* filename-only fallback */
  }
  return pages;
}

async function toFocusMaterial(
  env: Env,
  row: AtlasMaterialScanRow,
): Promise<FocusMaterial> {
  const sourceRole: SourceRole = isSourceRole(row.source_role)
    ? row.source_role
    : "lecture";
  let pages: FocusMaterial["pages"] = [];

  if (row.kind === "paste" && row.r2_key) {
    try {
      const obj = await env.MATERIALS.get(row.r2_key);
      const text = obj ? (await obj.text()).trim() : "";
      if (text) pages.push({ page: 1, text });
    } catch {
      /* filename-only fallback */
    }
  } else if (row.kind === "pdf") {
    const sidecar = await readAtlasOcrSidecar(env, row.atlas_id, row.id);
    if (sidecar?.pages.length) {
      for (const p of sidecar.pages) {
        pages.push({ page: p.page, text: p.text });
      }
    }
  } else if (row.kind === "pptx") {
    pages = await loadPptxPages(env, row);
  }

  return {
    id: row.id,
    filename: row.filename,
    sourceRole,
    pages,
  };
}

export async function loadAtlasFocusMaterials(
  db: D1Database,
  env: Env,
  atlasId: string,
): Promise<FocusMaterial[]> {
  const rows = await loadAtlasMaterialRows(db, atlasId);
  return Promise.all(rows.map((m) => toFocusMaterial(env, m)));
}

export async function countReadyAtlasMaterials(
  db: D1Database,
  atlasId: string,
): Promise<number> {
  const rows = await loadAtlasMaterialRows(db, atlasId);
  return rows.length;
}
