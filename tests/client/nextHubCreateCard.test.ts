import { describe, expect, it } from "vitest";
import type { CardDraftView } from "../../src/api/client";
import {
  blankHubCreateCard,
  nextHubCreateCard,
} from "../../src/deckHub/useCreateCardController";

function card(partial: Partial<CardDraftView>): CardDraftView {
  return { ...blankHubCreateCard("deck-1"), ...partial };
}

describe("nextHubCreateCard", () => {
  it("keeps the previous type for text cards", () => {
    expect(nextHubCreateCard(card({ type: "mcq" })).type).toBe("mcq");
    expect(nextHubCreateCard(card({ type: "cloze" })).type).toBe("cloze");
  });

  it("clears front and back", () => {
    const next = nextHubCreateCard(card({ type: "qa", front: "Q", back: "A" }));
    expect(next.front).toBe("");
    expect(next.back).toBe("");
  });

  it("keeps the occlusion image for the next card", () => {
    const next = nextHubCreateCard(
      card({
        type: "occlusion",
        media_r2_keys: ["materials/d/img.webp"],
        front: {
          image_key: "materials/d/img.webp",
          regions: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
        },
        back: { answer: "femur" },
      }),
    );
    expect(next.type).toBe("occlusion");
    expect(next.media_r2_keys).toEqual(["materials/d/img.webp"]);
    expect(next.front).toMatchObject({
      image_key: "materials/d/img.webp",
    });
  });
});
