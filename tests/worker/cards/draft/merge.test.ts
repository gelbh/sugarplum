import { describe, expect, it } from "vitest";
import {
  bindOcclusionImageKey,
  draftDedupeKey,
  mergeAndDedupeDrafts,
} from "../../../../worker/generation/draft-merge";
import type { CardDraft } from "../../../../worker/generation/schema";

function occlusionDraft(
  imageKey: string,
  regionIds: string[],
  answer: string,
): CardDraft {
  return {
    type: "occlusion",
    front: {
      image_key: imageKey,
      regions: regionIds.map((id, i) => ({
        id,
        x: 0.1 * i,
        y: 0.1,
        w: 0.2,
        h: 0.2,
        label: answer,
      })),
      mode: "hide_one",
    },
    back: { answer },
    provenance: { pages: [1], excerpt: "fig" },
  };
}

describe("mergeAndDedupeDrafts", () => {
  it("keeps rules first and drops near-identical fronts", () => {
    const rules: CardDraft[] = [
      {
        type: "qa",
        front: "What is ATP?",
        back: "Adenosine triphosphate",
        provenance: {
          pages: [1],
          excerpt: "What is ATP :: Adenosine triphosphate",
        },
      },
    ];
    const llm: CardDraft[] = [
      {
        type: "qa",
        front: "  what is atp?  ",
        back: "duplicate",
        provenance: { pages: [1], excerpt: "prose" },
      },
      {
        type: "qa",
        front: "What produces ATP?",
        back: "mitochondria",
        provenance: { pages: [1], excerpt: "prose" },
      },
    ];
    const merged = mergeAndDedupeDrafts(rules, llm);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.back).toBe("Adenosine triphosphate");
    expect(merged[1]!.front).toBe("What produces ATP?");
  });

  it("collapses occlusion drafts with same image_key and region ids", () => {
    const first = occlusionDraft("materials/deck/a.png", ["r1", "r2"], "A");
    const duplicate = occlusionDraft(
      "materials/deck/a.png",
      ["r1", "r2"],
      "dup",
    );
    const other = occlusionDraft("materials/deck/a.png", ["r1"], "B");
    expect(draftDedupeKey(first)).toBe(draftDedupeKey(duplicate));
    const merged = mergeAndDedupeDrafts([first], [duplicate, other]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.back).toEqual({ answer: "A" });
    expect(merged[1]!.back).toEqual({ answer: "B" });
  });
});

describe("bindOcclusionImageKey", () => {
  it("stamps front.image_key and media_keys on occlusion drafts", () => {
    const drafts: CardDraft[] = [
      occlusionDraft("llm-invented-key", ["r1"], "Femur"),
      {
        type: "qa",
        front: "Keep me",
        back: "ok",
        provenance: { pages: [1], excerpt: "text" },
      },
    ];
    const bound = bindOcclusionImageKey(drafts, "materials/deck/real.png");
    expect(bound[0]).toMatchObject({
      type: "occlusion",
      front: { image_key: "materials/deck/real.png" },
      media_keys: ["materials/deck/real.png"],
    });
    expect(bound[1]).toEqual(drafts[1]);
  });
});
