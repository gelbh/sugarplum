import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import { assertReadyPdfForOcr } from "../../worker/materials/ocr-gates";
import type { MaterialRow } from "../../worker/materials/types";

function material(partial: Partial<MaterialRow>): MaterialRow {
  return {
    id: "m1",
    deck_id: "d1",
    kind: "pdf",
    r2_key: "materials/d1/m1.pdf",
    filename: "notes.pdf",
    page_count: 3,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
    content_hash: null,
    source_role: "lecture",
    ...partial,
  };
}

describe("assertReadyPdfForOcr", () => {
  it("returns r2 key for ready pdf", () => {
    expect(assertReadyPdfForOcr(material({}))).toBe("materials/d1/m1.pdf");
  });

  it("rejects non-pdf", () => {
    try {
      assertReadyPdfForOcr(material({ kind: "image" }));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(422);
      expect((err as HTTPException).message).toBe(
        "OCR refill is only for a ready PDF",
      );
    }
  });

  it("rejects uploading pdf", () => {
    try {
      assertReadyPdfForOcr(material({ status: "uploading" }));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(422);
    }
  });
});
