import { describe, it, expect } from "vitest";
import {
  CardDraftSchema,
  OcclusionFrontSchema,
  parseCardDrafts,
} from "../../worker/generation/schema";

const provenance = { pages: [1], excerpt: "labelled femur head" };

const validFront = {
  image_key: "materials/deck-a/mat-1.png",
  prompt: "Identify the hidden region",
  regions: [
    {
      id: "r1",
      x: 0.1,
      y: 0.2,
      w: 0.3,
      h: 0.25,
      label: "Femur head",
    },
  ],
  mode: "hide_one" as const,
};

const validOcclusion = {
  type: "occlusion" as const,
  front: validFront,
  back: { answer: "Femur head" },
  provenance,
  media_keys: ["materials/deck-a/mat-1.png"],
};

describe("OcclusionFrontSchema", () => {
  it("parses a valid front", () => {
    const result = OcclusionFrontSchema.safeParse(validFront);
    expect(result.success).toBe(true);
  });

  it("rejects empty regions", () => {
    const result = OcclusionFrontSchema.safeParse({
      ...validFront,
      regions: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects out-of-range box coordinates", () => {
    const result = OcclusionFrontSchema.safeParse({
      ...validFront,
      regions: [{ ...validFront.regions[0], x: 1.5 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero-size region", () => {
    const result = OcclusionFrontSchema.safeParse({
      ...validFront,
      regions: [{ ...validFront.regions[0], w: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects overflowing boxes (x+w or y+h > 1)", () => {
    expect(
      OcclusionFrontSchema.safeParse({
        ...validFront,
        regions: [{ ...validFront.regions[0]!, x: 0.9, w: 0.5 }],
      }).success,
    ).toBe(false);
    expect(
      OcclusionFrontSchema.safeParse({
        ...validFront,
        regions: [{ ...validFront.regions[0]!, y: 0.9, h: 0.5 }],
      }).success,
    ).toBe(false);
  });

  it("rejects more than 8 regions", () => {
    const regions = Array.from({ length: 9 }, (_, i) => ({
      id: `r${i}`,
      x: 0,
      y: 0,
      w: 0.1,
      h: 0.1,
      label: `L${i}`,
    }));
    expect(
      OcclusionFrontSchema.safeParse({ ...validFront, regions }).success,
    ).toBe(false);
  });
});

describe("CardDraftSchema occlusion", () => {
  it("parses a valid occlusion draft", () => {
    const result = CardDraftSchema.safeParse(validOcclusion);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("occlusion");
      expect(result.data.front).toEqual(validFront);
      expect(result.data.back).toEqual({ answer: "Femur head" });
    }
  });

  it("parses occlusion without optional prompt and media_keys", () => {
    const { prompt: _prompt, ...frontNoPrompt } = validFront;
    const result = CardDraftSchema.safeParse({
      type: "occlusion",
      front: frontNoPrompt,
      back: { answer: "Femur head" },
      provenance,
    });
    expect(result.success).toBe(true);
  });

  it("rejects occlusion with empty regions via CardDraftSchema", () => {
    const result = CardDraftSchema.safeParse({
      ...validOcclusion,
      front: { ...validFront, regions: [] },
    });
    expect(result.success).toBe(false);
  });

  it("allows multi-blank cloze within the blank cap", () => {
    const result = CardDraftSchema.safeParse({
      type: "cloze",
      front: "{{c1::a}} and {{c2::b}}",
      back: "x",
      provenance,
    });
    expect(result.success).toBe(true);
  });

  it("does not apply cloze blank rules to occlusion", () => {
    const result = CardDraftSchema.safeParse({
      ...validOcclusion,
      front: {
        ...validFront,
        prompt: "Label ___ and {{c1::also}} this region",
      },
    });
    expect(result.success).toBe(true);
  });

  it("keeps text card types working alongside occlusion", () => {
    const drafts = parseCardDrafts([
      {
        type: "qa",
        front: "Q?",
        back: "A",
        provenance,
      },
      validOcclusion,
      {
        type: "cloze",
        front: "{{c1::a}} and {{c2::b}}",
        back: "a",
        provenance,
      },
    ]);
    expect(drafts).toHaveLength(3);
    expect(drafts.map((d) => d.type)).toEqual(["qa", "occlusion", "cloze"]);
  });
});
