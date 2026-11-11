import { describe, expect, it } from "vitest";
import { planProvenanceBackfillUpdates } from "../../worker/admin/provenance-backfill";

describe("planProvenanceBackfillUpdates", () => {
  const pageTextsByMaterial = new Map([
    [
      "mat-pdf",
      [
        { page: 1, text: "title slide immunology" },
        { page: 4, text: "spleen filters the blood major function" },
      ],
    ],
  ]);

  it("stamps accepted-style cards when excerpt lives on a later page", () => {
    const planned = planProvenanceBackfillUpdates({
      cards: [
        {
          id: "c1",
          type: "qa",
          material_id: "mat-pdf",
          provenance_json: JSON.stringify({
            pages: [1],
            excerpt: "spleen filters the blood",
          }),
        },
      ],
      pageTextsByMaterial,
      limit: 100,
    });
    expect(planned.updates).toHaveLength(1);
    expect(planned.updates[0]?.after).toEqual([4]);
    expect(planned.updates[0]?.before).toEqual([1]);
    expect(JSON.parse(planned.updates[0]!.provenance_json)).toMatchObject({
      pages: [4],
      excerpt: "spleen filters the blood",
    });
  });

  it("skips occlusion and empty excerpt", () => {
    const planned = planProvenanceBackfillUpdates({
      cards: [
        {
          id: "occ",
          type: "occlusion",
          material_id: "mat-pdf",
          provenance_json: JSON.stringify({
            pages: [1],
            excerpt: "spleen filters",
          }),
        },
        {
          id: "empty",
          type: "qa",
          material_id: "mat-pdf",
          provenance_json: JSON.stringify({ pages: [1], excerpt: "" }),
        },
      ],
      pageTextsByMaterial,
      limit: 100,
    });
    expect(planned.updates).toHaveLength(0);
    expect(planned.skipped).toBe(2);
  });

  it("respects limit on updates", () => {
    const cards = [1, 2, 3].map((n) => ({
      id: `c${n}`,
      type: "qa",
      material_id: "mat-pdf",
      provenance_json: JSON.stringify({
        pages: [1],
        excerpt: "spleen filters the blood",
      }),
    }));
    const planned = planProvenanceBackfillUpdates({
      cards,
      pageTextsByMaterial,
      limit: 2,
    });
    expect(planned.updates).toHaveLength(2);
  });

  it("skips when pages already match", () => {
    const planned = planProvenanceBackfillUpdates({
      cards: [
        {
          id: "ok",
          type: "qa",
          material_id: "mat-pdf",
          provenance_json: JSON.stringify({
            pages: [4],
            excerpt: "spleen filters the blood",
          }),
        },
      ],
      pageTextsByMaterial,
      limit: 100,
    });
    expect(planned.updates).toHaveLength(0);
    expect(planned.skipped).toBe(1);
  });
});
