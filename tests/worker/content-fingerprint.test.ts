import { describe, expect, it } from "vitest";
import {
  cardContentFingerprint,
  normalizeCardField,
} from "../../worker/cards/contentFingerprint";

describe("normalizeCardField", () => {
  it("trims, collapses whitespace, lowercases", () => {
    expect(normalizeCardField("  What   Is  IgA? ")).toBe("what is iga?");
  });
});

describe("cardContentFingerprint", () => {
  it("is stable across whitespace/case on front", async () => {
    const a = await cardContentFingerprint({
      type: "qa",
      front: "What are PAMPs?",
    });
    const b = await cardContentFingerprint({
      type: "qa",
      front: "  what   are   pamps? ",
    });
    expect(a).toBe(b);
  });

  it("differs when media keys differ (image_label)", async () => {
    const a = await cardContentFingerprint({
      type: "image_label",
      front: "name",
      mediaR2Keys: ["materials/d1/a.png"],
      back: "IgA",
    });
    const b = await cardContentFingerprint({
      type: "image_label",
      front: "name",
      mediaR2Keys: ["materials/d1/b.png"],
      back: "IgA",
    });
    expect(a).not.toBe(b);
  });

  it("differs when image_label back differs with same media", async () => {
    const a = await cardContentFingerprint({
      type: "image_label",
      front: "name",
      mediaR2Keys: ["materials/d1/a.png"],
      back: "IgA",
    });
    const b = await cardContentFingerprint({
      type: "image_label",
      front: "name",
      mediaR2Keys: ["materials/d1/a.png"],
      back: "IgM",
    });
    expect(a).not.toBe(b);
  });

  it("includes MCQ options", async () => {
    const a = await cardContentFingerprint({
      type: "mcq",
      front: "Pick one",
      back: "A",
      options: ["A", "B"],
    });
    const b = await cardContentFingerprint({
      type: "mcq",
      front: "Pick one",
      back: "A",
      options: ["A", "C"],
    });
    expect(a).not.toBe(b);
  });
});
