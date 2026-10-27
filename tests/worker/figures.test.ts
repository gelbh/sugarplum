import { describe, expect, it } from "vitest";
import type { FigureCrop } from "../../worker/materials/docling";
import {
  figureR2Key,
  listFigureR2KeysForPdf,
  persistFigureCrops,
} from "../../worker/materials/figures";
import { createTestEnv } from "./test-env";

function crop(overrides: Partial<FigureCrop> & Pick<FigureCrop, "index">): FigureCrop {
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

describe("persistFigureCrops", () => {
  it("stores each crop in R2 and inserts ready image materials", async () => {
    const env = createTestEnv();
    const crops = [
      crop({ page: 2, index: 0 }),
      crop({ page: 5, index: 1 }),
    ];

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

    const rows = env.getMaterials().filter((m) => m.kind === "image");
    expect(rows).toHaveLength(2);
    expect(rows.map((m) => m.status)).toEqual(["ready", "ready"]);
    expect(rows.map((m) => m.filename)).toEqual([
      "figure-p2-0.png",
      "figure-p5-1.png",
    ]);
    expect(rows.map((m) => m.r2_key)).toEqual([
      "materials/deck-a/figures/pdf-parent/0.png",
      "materials/deck-a/figures/pdf-parent/1.png",
    ]);

    expect(env.getR2Keys().sort()).toEqual([
      "materials/deck-a/figures/pdf-parent/0.png",
      "materials/deck-a/figures/pdf-parent/1.png",
    ]);
  });
});

describe("listFigureR2KeysForPdf", () => {
  it("returns sorted figure keys for the pdf material prefix", async () => {
    const env = createTestEnv();
    await persistFigureCrops(env, {
      deckId: "deck-a",
      pdfMaterialId: "pdf-parent",
      crops: [crop({ index: 1 }), crop({ index: 0 })],
    });
    env.seedMaterial({
      id: "other-img",
      deck_id: "deck-a",
      kind: "image",
      r2_key: "materials/deck-a/other.png",
      filename: "other.png",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const keys = await listFigureR2KeysForPdf(env.DB, {
      deckId: "deck-a",
      pdfMaterialId: "pdf-parent",
    });

    expect(keys).toEqual([
      "materials/deck-a/figures/pdf-parent/0.png",
      "materials/deck-a/figures/pdf-parent/1.png",
    ]);
  });

  it("returns empty when no figure materials exist", async () => {
    const env = createTestEnv();
    const keys = await listFigureR2KeysForPdf(env.DB, {
      deckId: "deck-a",
      pdfMaterialId: "pdf-parent",
    });
    expect(keys).toEqual([]);
  });
});
