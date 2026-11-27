import { describe, expect, it } from "vitest";
import { HTTPException } from "hono/http-exception";
import type { AtlasEntryView } from "../../../src/atlas/types";
import {
  MAX_MAKE_CARDS_ENTRIES,
  parseMakeCardsDeckId,
  parseMakeCardsEntryKeys,
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
    personalNote: null,
    tier: null,
    reason: null,
    override: null,
    focusMaterialIds: [],
    ...partial,
  };
}

describe("parseMakeCardsDeckId", () => {
  it("trims deckId", () => {
    expect(parseMakeCardsDeckId({ deckId: " deck-a " })).toBe("deck-a");
  });

  it("rejects missing deckId", () => {
    try {
      parseMakeCardsDeckId({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HTTPException);
      expect((err as HTTPException).status).toBe(400);
      expect((err as HTTPException).message).toBe("deckId required");
    }
  });
});

describe("parseMakeCardsEntryKeys", () => {
  it("dedupes entryKeys", () => {
    expect(
      parseMakeCardsEntryKeys({
        entryKeys: ["a", " a ", "b", 1, ""],
      }),
    ).toEqual(["a", "b"]);
  });

  it("rejects empty entryKeys", () => {
    try {
      parseMakeCardsEntryKeys({ entryKeys: [] });
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
      parseMakeCardsEntryKeys({ entryKeys: keys });
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

  it("returns precraft drafts/claims and extras-only text when leftovers remain", () => {
    const entries = [
      entry({
        id: "ascaris-suum",
        originKey: "ascaris-suum",
        canonicalName: "Ascaris suum",
        commonName: "Pig ascarid",
        fields: {
          ...emptyParasiteFields(),
          group: "nematode",
          family: "Ascarididae",
          majorOrgan: "small intestine",
          definitiveHosts: ["pig"],
          significance: "Larval migration scars the liver",
          lifecycleStages: [
            {
              name: "egg",
              location: null,
              hostRole: null,
              host: null,
              durationDays: null,
              infective: false,
              diagnostic: true,
              transmission: null,
              note: null,
              imageId: null,
            },
          ],
        },
        refs: [{ field: null, citation: "WCVM", url: null, note: null }],
      }),
    ];
    const prepared = prepareMakeCardsItems(entries, ["ascaris-suum"]);
    expect(prepared).toHaveLength(1);
    const item = prepared[0]!;
    expect(item.hasExtras).toBe(true);
    expect(item.drafts.length).toBeGreaterThan(0);
    expect(item.claims.length).toBe(item.drafts.length);
    const organ = item.drafts.find(
      (d) =>
        typeof d.front === "string" &&
        d.front.includes("Ascaris suum") &&
        /major organ/i.test(d.front),
    );
    expect(organ?.back).toBe("small intestine");
    expect(item.text).not.toContain("Major organ:");
    expect(item.text).toContain("Lifecycle order:");
    expect(item.text).toContain("Significance:");
    expect(item.text).not.toMatch(/^Parasite: Ascaris suum\n$/);
  });

  it("uses locked Parasite stub and hasExtras false when extras are empty", () => {
    const entries = [
      entry({
        id: "thin-1",
        originKey: "thin-1",
        canonicalName: "Thinus onlyus",
        commonName: "Thin worm",
        fields: {
          ...emptyParasiteFields(),
          group: "nematode",
          majorOrgan: "ileum",
        },
      }),
    ];
    const prepared = prepareMakeCardsItems(entries, ["thin-1"]);
    expect(prepared).toHaveLength(1);
    expect(prepared[0]?.hasExtras).toBe(false);
    expect(prepared[0]?.text).toBe("Parasite: Thinus onlyus\n");
    expect(
      prepared[0]?.drafts.some(
        (d) =>
          typeof d.front === "string" &&
          d.front.includes("Thinus onlyus") &&
          /major organ/i.test(d.front),
      ),
    ).toBe(true);
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
