import { describe, expect, it } from "vitest";
import {
  collectDeckImageKeys,
  hubDiyTypes,
  validateHubCreateCard,
} from "../../src/lib/hubDiyCreate";

describe("hubDiyTypes", () => {
  it("keeps guest DIY to text types only", () => {
    expect(hubDiyTypes(true)).toEqual(["qa", "cloze", "mcq"]);
  });

  it("adds occlusion and image_label for signed-in users", () => {
    expect(hubDiyTypes(false)).toEqual([
      "qa",
      "cloze",
      "mcq",
      "occlusion",
      "image_label",
    ]);
  });
});

describe("collectDeckImageKeys", () => {
  it("dedupes media keys and occlusion image_key", () => {
    const keys = collectDeckImageKeys([
      {
        id: "1",
        deck_id: "d",
        job_id: null,
        type: "image_label",
        front: "f",
        back: "b",
        media_r2_keys: ["materials/d/a.png"],
        provenance: null,
        status: "accepted",
        created_at: "",
        updated_at: "",
      },
      {
        id: "2",
        deck_id: "d",
        job_id: null,
        type: "occlusion",
        front: {
          image_key: "materials/d/a.png",
          regions: [
            { id: "r1", x: 0, y: 0, w: 0.1, h: 0.1, label: "x" },
          ],
          mode: "hide_one",
        },
        back: { answer: "x" },
        provenance: null,
        status: "accepted",
        created_at: "",
        updated_at: "",
      },
      {
        id: "3",
        deck_id: "d",
        job_id: null,
        type: "qa",
        front: "q",
        back: "a",
        media_r2_keys: ["materials/d/b.png"],
        provenance: null,
        status: "accepted",
        created_at: "",
        updated_at: "",
      },
    ]);
    expect(keys).toEqual(["materials/d/a.png", "materials/d/b.png"]);
  });
});

describe("validateHubCreateCard", () => {
  const base = {
    id: "draft",
    deck_id: "d",
    job_id: null,
    provenance: null,
    status: "draft",
    created_at: "",
    updated_at: "",
  };

  it("requires image for image_label", () => {
    const result = validateHubCreateCard({
      ...base,
      type: "image_label",
      front: "Name it",
      back: "Answer",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/image/i);
  });

  it("accepts occlusion with regions and material key", () => {
    const front = {
      image_key: "materials/d/slide.png",
      regions: [
        { id: "r1", x: 0.1, y: 0.2, w: 0.3, h: 0.2, label: "A" },
      ],
      mode: "hide_one" as const,
    };
    const result = validateHubCreateCard({
      ...base,
      type: "occlusion",
      front,
      back: { answer: "A" },
    });
    expect(result).toEqual({
      ok: true,
      body: { type: "occlusion", front, back: { answer: "A" } },
    });
  });
});
