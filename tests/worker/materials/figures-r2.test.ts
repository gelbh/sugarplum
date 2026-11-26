import { env as cfEnv } from "cloudflare:workers";
import {
  getMaterials,
  getR2Keys,
  resetTestDb,
  seedDeck,
  seedMaterial,
  seedUser,
} from "../harness";
import { afterEach, describe, expect, it } from "vitest";
import type { FigureCrop } from "../../../worker/materials/docling";
import {
  figureR2Key,
  figureR2KeyPrefixBounds,
  listFigureR2KeysForPdf,
  persistFigureCrops,
} from "../../../worker/materials/figures";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

async function ensureDeck(
  env: typeof cfEnv,
  deckId = "deck-a",
): Promise<void> {
  await seedUser(env, {
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  await seedDeck(env, {
    id: deckId,
    user_id: "user-a",
    title: "Figures",
    subject_hint: null,
    subject_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
}

function crop(
  overrides: Partial<FigureCrop> & Pick<FigureCrop, "index">,
): FigureCrop {
  return {
    page: overrides.page ?? 1,
    index: overrides.index,
    caption: overrides.caption ?? "",
    mimeType: "image/png",
    bytes: overrides.bytes ?? new Uint8Array([137, 80, 78, 71]).buffer,
  };
}

describe("figureR2Key", () => {
  it("uses deck, pdf material id, and index", () => {
    expect(figureR2Key("deck-1", "pdf-mat", 3)).toBe(
      "materials/deck-1/figures/pdf-mat/3.png",
    );
  });
});

describe("figureR2KeyPrefixBounds", () => {
  // D1 caps LIKE/GLOB patterns at 50 bytes; UUID figure prefixes are ~93.
  const deckId = "f60321ef-35c7-49f2-85f6-19ff95e4911a";
  const pdfMaterialId = "4439969e-3fa4-4b66-b946-d534509f7baf";

  it("builds a half-open range that covers figure keys under the pdf prefix", () => {
    const { lower, upper } = figureR2KeyPrefixBounds(deckId, pdfMaterialId);
    expect(lower).toBe(`materials/${deckId}/figures/${pdfMaterialId}/`);
    expect(upper).toBe(`materials/${deckId}/figures/${pdfMaterialId}0`);
    const key = figureR2Key(deckId, pdfMaterialId, 0);
    expect(key >= lower && key < upper).toBe(true);
    expect(
      `materials/${deckId}/figures/${pdfMaterialId}-other/0.png` < lower,
    ).toBe(true);
    // Exclusive upper: stem0… sorts at/after upper (ASCII '/' then '0').
    const atUpper = `materials/${deckId}/figures/${pdfMaterialId}0/0.png`;
    expect(atUpper >= upper).toBe(true);
    expect(atUpper < upper).toBe(false);
  });

  it("documents that the old LIKE pattern exceeds D1's 50-byte limit", () => {
    const likePattern = `materials/${deckId}/figures/${pdfMaterialId}/%`;
    expect(likePattern.length).toBeGreaterThan(50);
  });
});

describe("persistFigureCrops", () => {
  it("stores each crop in R2 without inserting materials rows", async () => {
    const env = cfEnv;
    const crops = [crop({ page: 2, index: 0 }), crop({ page: 5, index: 1 })];

    const persisted = await persistFigureCrops(env, {
      deckId: "deck-a",
      pdfMaterialId: "pdf-parent",
      crops,
    });

    expect(persisted).toHaveLength(2);
    expect(persisted[0]?.r2Key).toBe(
      "materials/deck-a/figures/pdf-parent/0.png",
    );
    expect(persisted[1]?.r2Key).toBe(
      "materials/deck-a/figures/pdf-parent/1.png",
    );

    expect((await getMaterials(env)).filter((m) => m.kind === "image")).toHaveLength(
      0,
    );

    expect((await getR2Keys(env)).sort()).toEqual([
      "materials/deck-a/figures/pdf-parent/0.png",
      "materials/deck-a/figures/pdf-parent/1.png",
    ]);
  });
});

describe("listFigureR2KeysForPdf", () => {
  it("returns sorted figure keys for the pdf material prefix", async () => {
    const env = cfEnv;
    await ensureDeck(env);
    await persistFigureCrops(env, {
      deckId: "deck-a",
      pdfMaterialId: "pdf-parent",
      crops: [crop({ index: 1 }), crop({ index: 0 })],
    });
    await seedMaterial(env, {
      id: "other-img",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/other.png",
      filename: "other.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const keys = await listFigureR2KeysForPdf(env, {
      deckId: "deck-a",
      pdfMaterialId: "pdf-parent",
    });

    expect(keys).toEqual([
      "materials/deck-a/figures/pdf-parent/0.png",
      "materials/deck-a/figures/pdf-parent/1.png",
    ]);
  });

  it("returns empty when no figure objects exist", async () => {
    const env = cfEnv;
    const keys = await listFigureR2KeysForPdf(env, {
      deckId: "deck-a",
      pdfMaterialId: "pdf-parent",
    });
    expect(keys).toEqual([]);
  });

  it("lists figure keys when deck and pdf ids are production-length UUIDs", async () => {
    const env = cfEnv;
    const deckId = "f60321ef-35c7-49f2-85f6-19ff95e4911a";
    const pdfMaterialId = "4439969e-3fa4-4b66-b946-d534509f7baf";
    await persistFigureCrops(env, {
      deckId,
      pdfMaterialId,
      crops: [crop({ index: 0 })],
    });

    const keys = await listFigureR2KeysForPdf(env, {
      deckId,
      pdfMaterialId,
    });

    expect(keys).toEqual([figureR2Key(deckId, pdfMaterialId, 0)]);
  });
});

describe("persistFigureCrops race with client uploads", () => {
  it("skips crops whose r2_key is already uploading or ready", async () => {
    const env = cfEnv;
    await ensureDeck(env);
    await seedMaterial(env, {
      id: "client-crop",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/figures/pdf-parent/0.png",
      filename: "crop.png",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const persisted = await persistFigureCrops(env, {
      deckId: "deck-a",
      pdfMaterialId: "pdf-parent",
      crops: [crop({ index: 0 }), crop({ index: 1 })],
    });

    expect(persisted.map((p) => p.r2Key)).toEqual([
      "materials/deck-a/figures/pdf-parent/1.png",
    ]);
    expect((await getMaterials(env)).filter((m) => m.kind === "image")).toHaveLength(
      1,
    );
    expect((await getR2Keys(env))).toContain(
      "materials/deck-a/figures/pdf-parent/1.png",
    );
  });
});
