import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import type { AtlasEntryView } from "../../../src/atlas/types";
import {
  MAX_MAKE_CARDS_ENTRIES,
  parseMakeCardsBody,
  prepareMakeCardsItems,
} from "../../../worker/atlas/make-cards-body";
import { emptyParasiteFields } from "../../../worker/atlas/templates/parasite";

function entry(partial: Partial<AtlasEntryView> & Pick<AtlasEntryView, "id">): AtlasEntryView {
  return {
    originKey: partial.originKey ?? partial.id,
    canonicalName: partial.canonicalName ?? "Toxocara canis",
    commonName: partial.commonName ?? null,
    aliases: partial.aliases ?? [],
    fields: partial.fields ?? { ...emptyParasiteFields(), group: "nematode" },
    refs: partial.refs ?? [],
    images: partial.images ?? [],
    editedAt: null,
    tier: null,
    reason: null,
    focusMaterialIds: [],
    ...partial,
  };
}

describe("parseMakeCardsBody", () => {
  it("trims deckId and dedupes entryKeys", () => {
    expect(
      parseMakeCardsBody({
        deckId: " deck-a ",
        entryKeys: ["a", " a ", "b", 1, ""],
      }),
    ).toEqual({ deckId: "deck-a", entryKeys: ["a", "b"] });
  });

  it("rejects missing deckId", () => {
    try {
      parseMakeCardsBody({ entryKeys: ["a"] });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(400);
      expect((err as HTTPException).message).toBe("deckId required");
    }
  });

  it("rejects empty entryKeys", () => {
    try {
      parseMakeCardsBody({ deckId: "d", entryKeys: [] });
      expect.unreachable();
    } catch (err) {
      expect((err as HTTPException).message).toBe("entryKeys required");
    }
  });

  it("rejects more than MAX_MAKE_CARDS_ENTRIES", () => {
    const keys = Array.from({ length: MAX_MAKE_CARDS_ENTRIES + 1 }, (_, i) =>
      String(i),
    );
    try {
      parseMakeCardsBody({ deckId: "d", entryKeys: keys });
      expect.unreachable();
    } catch (err) {
      expect((err as HTTPException).message).toBe(
        `At most ${MAX_MAKE_CARDS_ENTRIES} entries per request`,
      );
    }
  });
});

describe("prepareMakeCardsItems", () => {
  it("resolves by id or originKey and builds source", () => {
    const entries = [
      entry({
        id: "overlay-1",
        originKey: "toxocara-canis",
        canonicalName: "Toxocara canis",
        refs: [{ field: null, citation: "ref-a", url: null, note: null }],
      }),
    ];
    const prepared = prepareMakeCardsItems(entries, ["toxocara-canis"]);
    expect(prepared).toHaveLength(1);
    expect(prepared[0]?.entryKey).toBe("toxocara-canis");
    expect(prepared[0]?.text).toContain("Toxocara canis");
    expect(prepared[0]?.citations).toEqual(["ref-a"]);
  });

  it("404s unknown keys", () => {
    try {
      prepareMakeCardsItems([entry({ id: "a" })], ["missing"]);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(404);
      expect((err as HTTPException).message).toBe("Entry not found: missing");
    }
  });
});
