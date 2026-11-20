import type { Env } from "../env";
import { isSourceRole, type SourceRole } from "../../src/materials/sourceRole";
import { type FocusMaterial } from "../../src/atlas/hub/focusScan";
import { extractPdfPages } from "../materials/extract-pdf";
import {
  applyOcrSidecar,
  focusSidecarCacheHit,
  OCR_PAGE_CHAR_CAP,
  readAtlasOcrSidecar,
  writeAtlasOcrSidecar,
} from "../materials/ocr-sidecar";
import { persistAtlasPptxSidecarFromBytes } from "./pptx-sidecar";

export type AtlasMaterialScanRow = {
  id: string;
  atlas_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  source_role: string;
  status: string;
  content_hash: string | null;
};

const READY_STATUS = "ready";
const SCAN_KINDS = new Set(["pdf", "paste", "pptx"]);

export async function loadAtlasMaterialRows(
  db: D1Database,
  atlasId: string,
): Promise<AtlasMaterialScanRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, atlas_id, kind, r2_key, filename, source_role, status,
              content_hash
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
    const persisted = await persistAtlasPptxSidecarFromBytes(
      env,
      row.atlas_id,
      row.id,
      await obj.arrayBuffer(),
    );
    if (persisted?.pages.length) {
      for (const p of persisted.pages) {
        pages.push({ page: p.page, text: p.text });
      }
    }
  } catch (err) {
    console.warn("atlas PPTX Focus backfill failed", err);
  }
  return pages;
}

/** Exported for tests: PDF Focus corpus = native extract + OCR fill + hash cache. */
export async function loadAtlasPdfFocusPages(
  env: Env,
  row: AtlasMaterialScanRow,
): Promise<FocusMaterial["pages"]> {
  const sidecar = await readAtlasOcrSidecar(env, row.atlas_id, row.id);
  if (focusSidecarCacheHit(sidecar, row.content_hash)) {
    return sidecar!.pages.map((p) => ({ page: p.page, text: p.text }));
  }

  if (!row.r2_key) {
    return sidecar?.pages.length
      ? sidecar.pages.map((p) => ({ page: p.page, text: p.text }))
      : [];
  }

  try {
    const obj = await env.MATERIALS.get(row.r2_key);
    if (!obj) {
      return sidecar?.pages.length
        ? sidecar.pages.map((p) => ({ page: p.page, text: p.text }))
        : [];
    }
    const window = await extractPdfPages(await obj.arrayBuffer());
    const native = window.pages.map((p) => ({
      page: p.page,
      // Match parseStoredOcrPages cap so Focus cache round-trips.
      text: p.text.trim().slice(0, OCR_PAGE_CHAR_CAP),
    }));
    const merged = applyOcrSidecar(native, sidecar);
    if (row.content_hash && merged.some((p) => p.text.trim())) {
      try {
        await writeAtlasOcrSidecar(env, row.atlas_id, row.id, merged, {
          sourceContentHash: row.content_hash,
          unstudiedPages: sidecar?.unstudiedPages,
        });
      } catch (err) {
        console.warn("atlas Focus sidecar write failed", err);
      }
    }
    return merged;
  } catch (err) {
    console.warn("atlas PDF Focus extract failed", err);
    return sidecar?.pages.length
      ? sidecar.pages.map((p) => ({ page: p.page, text: p.text }))
      : [];
  }
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
    pages = await loadAtlasPdfFocusPages(env, row);
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

/** Bump when Focus scan rules or fingerprint inputs change so complete maps rescan. */
export const FOCUS_PACK_FINGERPRINT_VERSION = "v3";

export function focusPackFingerprint(
  rows: ReadonlyArray<{
    id: string;
    content_hash: string | null;
    source_role: string;
  }>,
): string {
  const markers = rows
    .map(
      (r) => `${r.id}:${r.content_hash ?? "nochash"}:${r.source_role}`,
    )
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return `${FOCUS_PACK_FINGERPRINT_VERSION}:${markers.join("|")}`;
}
