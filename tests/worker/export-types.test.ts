import { describe, it, expect } from "vitest";
import {
  CreateExportBodySchema,
  ExportScopeSchema,
  ExportWarningsSchema,
  parseExportScopeJson,
  parseExportWarningsJson,
} from "../../worker/export/types";

describe("CreateExportBodySchema", () => {
  it("parses a deck export request", () => {
    const result = CreateExportBodySchema.safeParse({
      type: "deck",
      deckId: "deck-abc",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ type: "deck", deckId: "deck-abc" });
    }
  });

  it("rejects empty deckId", () => {
    const result = CreateExportBodySchema.safeParse({
      type: "deck",
      deckId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown scope type", () => {
    const result = ExportScopeSchema.safeParse({
      type: "subject",
      subjectId: "sub-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("ExportWarningsSchema", () => {
  it("parses warning counts", () => {
    const result = ExportWarningsSchema.safeParse({
      missingMedia: 2,
      skippedCards: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative counts", () => {
    const result = ExportWarningsSchema.safeParse({
      missingMedia: -1,
      skippedCards: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("stored JSON helpers", () => {
  it("parseExportScopeJson reads request_json", () => {
    expect(
      parseExportScopeJson(JSON.stringify({ type: "deck", deckId: "d1" })),
    ).toEqual({ type: "deck", deckId: "d1" });
  });

  it("parseExportWarningsJson returns null for invalid JSON", () => {
    expect(parseExportWarningsJson("not-json")).toBeNull();
  });
});
