import { describe, expect, it } from "vitest";
import type { CardType } from "../../src/api/client";
import { resolveEditorType } from "../../src/draftReview/DraftCardEditor";

describe("resolveEditorType (hub allowedTypes)", () => {
  const diy: CardType[] = ["qa", "cloze", "mcq"];

  it("does not coerce image_label to qa", () => {
    const resolved = resolveEditorType("image_label", diy);
    expect(resolved.typeSelectLocked).toBe(true);
    expect(resolved.typeValue).toBe("image_label");
  });

  it("does not coerce diagram to qa", () => {
    const resolved = resolveEditorType("diagram", diy);
    expect(resolved.typeSelectLocked).toBe(true);
    expect(resolved.typeValue).toBe("diagram");
  });

  it("leaves qa unlocked within DIY set", () => {
    const resolved = resolveEditorType("qa", diy);
    expect(resolved.typeSelectLocked).toBe(false);
    expect(resolved.typeValue).toBe("qa");
  });

  it("leaves occlusion unlocked when allowed", () => {
    const accountDiy: CardType[] = [
      "qa",
      "cloze",
      "mcq",
      "occlusion",
      "image_label",
    ];
    const resolved = resolveEditorType("occlusion", accountDiy);
    expect(resolved.typeSelectLocked).toBe(false);
    expect(resolved.typeValue).toBe("occlusion");
  });
});
