import type { Env } from "../env";
import { getDb } from "../db/client";
import {
  applyOcrSidecar,
  readOcrSidecar,
} from "../materials/ocr-sidecar";
import { extractAllPdfPageTexts } from "../materials/extract-pdf";
import {
  stampDraftProvenancePages,
  type PageText,
} from "../../src/study/notes/excerptPages";
import { mergeProvenancePagesIntoJson } from "../../src/study/notes/notesProvenanceWrite";
import { provenanceExcerptText } from "../../src/study/regenSource";

const SKIP_TYPES = new Set(["image_label", "diagram", "occlusion"]);

export type ProvenanceBackfillOpts = {
  dry_run?: boolean;
  limit?: number;
};

export type ProvenanceBackfillSample = {
  id: string;
  before: number[];
  after: number[];
};

export type ProvenanceBackfillResult = {
  scanned: number;
  updated: number;
  skipped: number;
  dry_run: boolean;
  samples: ProvenanceBackfillSample[];
};

type CandidateRow = {
  id: string;
  type: string;
  provenance_json: string | null;
  material_id: string;
  deck_id: string;
  r2_key: string;
};

function parseProvenance(
  raw: string | null,
): { pages: number[]; excerpt: string } {
  if (!raw) return { pages: [], excerpt: "" };
  try {
    const parsed = JSON.parse(raw) as {
      pages?: unknown;
      excerpt?: unknown;
    };
    const pages = Array.isArray(parsed.pages)
      ? parsed.pages.filter(
          (p): p is number =>
            typeof p === "number" && Number.isInteger(p) && p >= 1,
        )
      : [];
    const excerpt =
      typeof parsed.excerpt === "string" ? parsed.excerpt : "";
    return { pages, excerpt };
  } catch {
    return { pages: [], excerpt: "" };
  }
}

/** Pure planner for tests: stamp candidates against preloaded page texts. */
export function planProvenanceBackfillUpdates(args: {
  cards: readonly {
    id: string;
    type: string;
    provenance_json: string | null;
    material_id: string;
  }[];
  pageTextsByMaterial: ReadonlyMap<string, readonly PageText[]>;
  limit: number;
}): {
  updates: {
    id: string;
    provenance_json: string;
    prior_provenance_json: string | null;
    before: number[];
    after: number[];
  }[];
  scanned: number;
  skipped: number;
} {
  const updates: {
    id: string;
    provenance_json: string;
    prior_provenance_json: string | null;
    before: number[];
    after: number[];
  }[] = [];
  let scanned = 0;
  let skipped = 0;

  for (const card of args.cards) {
    if (updates.length >= args.limit) break;
    scanned += 1;
    if (SKIP_TYPES.has(card.type)) {
      skipped += 1;
      continue;
    }
    const provenance = parseProvenance(card.provenance_json);
    if (provenanceExcerptText(provenance) === "") {
      skipped += 1;
      continue;
    }
    const pageTexts = args.pageTextsByMaterial.get(card.material_id);
    if (!pageTexts || pageTexts.length === 0) {
      skipped += 1;
      continue;
    }
    const stamped = stampDraftProvenancePages(
      [{ provenance }],
      pageTexts,
      provenance.pages,
    )[0]!;
    const after = stamped.provenance.pages;
    const before = provenance.pages;
    const same =
      after.length === before.length &&
      after.every((page, index) => page === before[index]);
    if (same) {
      skipped += 1;
      continue;
    }
    updates.push({
      id: card.id,
      before,
      after,
      prior_provenance_json: card.provenance_json,
      provenance_json: mergeProvenancePagesIntoJson(
        card.provenance_json,
        after,
      ),
    });
  }

  return { updates, scanned, skipped };
}

export async function runProvenanceBackfill(
  env: Env,
  opts: ProvenanceBackfillOpts = {},
): Promise<ProvenanceBackfillResult> {
  const dry_run = Boolean(opts.dry_run);
  const limit =
    typeof opts.limit === "number" &&
    Number.isInteger(opts.limit) &&
    opts.limit > 0
      ? Math.min(opts.limit, 500)
      : 100;

  const db = getDb(env);
  const { results } = await db
    .prepare(
      `SELECT c.id, c.type, c.provenance_json, m.id AS material_id, m.deck_id, m.r2_key
       FROM cards c
       JOIN generation_jobs j ON j.id = c.job_id
       JOIN materials m ON m.id = j.material_id
       WHERE c.status = 'accepted'
         AND c.job_id IS NOT NULL
         AND m.kind = 'pdf'
         AND m.r2_key IS NOT NULL
       ORDER BY c.updated_at ASC`,
    )
    .all<CandidateRow>();

  const candidates = results ?? [];
  const pageTextsByMaterial = new Map<string, PageText[]>();
  const materialMeta = new Map<
    string,
    { deck_id: string; r2_key: string }
  >();
  for (const row of candidates) {
    materialMeta.set(row.material_id, {
      deck_id: row.deck_id,
      r2_key: row.r2_key,
    });
  }

  async function loadMaterialPages(
    materialId: string,
  ): Promise<PageText[]> {
    const cached = pageTextsByMaterial.get(materialId);
    if (cached) return cached;
    const meta = materialMeta.get(materialId);
    if (!meta) {
      pageTextsByMaterial.set(materialId, []);
      return [];
    }
    const obj = await env.MATERIALS.get(meta.r2_key);
    if (!obj) {
      pageTextsByMaterial.set(materialId, []);
      return [];
    }
    const bytes = await obj.arrayBuffer();
    const extracted = await extractAllPdfPageTexts(bytes);
    const sidecar = await readOcrSidecar(env, meta.deck_id, materialId);
    const pages = applyOcrSidecar(extracted.pages, sidecar);
    pageTextsByMaterial.set(materialId, pages);
    return pages;
  }

  const updates: {
    id: string;
    provenance_json: string;
    prior_provenance_json: string | null;
    before: number[];
    after: number[];
  }[] = [];
  let scanned = 0;
  let skipped = 0;

  for (const row of candidates) {
    if (updates.length >= limit) break;
    await loadMaterialPages(row.material_id);
    const planned = planProvenanceBackfillUpdates({
      cards: [
        {
          id: row.id,
          type: row.type,
          provenance_json: row.provenance_json,
          material_id: row.material_id,
        },
      ],
      pageTextsByMaterial,
      limit: 1,
    });
    scanned += planned.scanned;
    skipped += planned.skipped;
    for (const update of planned.updates) {
      if (updates.length >= limit) break;
      updates.push(update);
    }
  }

  let applied = 0;
  if (!dry_run) {
    const updatedAt = new Date().toISOString();
    for (const update of updates) {
      const result =
        update.prior_provenance_json === null
          ? await db
              .prepare(
                `UPDATE cards
                 SET provenance_json = ?, updated_at = ?
                 WHERE id = ? AND provenance_json IS NULL`,
              )
              .bind(update.provenance_json, updatedAt, update.id)
              .run()
          : await db
              .prepare(
                `UPDATE cards
                 SET provenance_json = ?, updated_at = ?
                 WHERE id = ? AND provenance_json = ?`,
              )
              .bind(
                update.provenance_json,
                updatedAt,
                update.id,
                update.prior_provenance_json,
              )
              .run();
      if (result.meta.changes) applied += 1;
      else skipped += 1;
    }
  }

  return {
    scanned,
    updated: dry_run ? updates.length : applied,
    skipped,
    dry_run,
    samples: updates.slice(0, 10).map((u) => ({
      id: u.id,
      before: u.before,
      after: u.after,
    })),
  };
}
