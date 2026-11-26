import { describe, expect, it } from "vitest";
import {
  HubCreateCardSchema,
  HubCreateTextCardSchema,
} from "../../../worker/materials/hub-create-card";

describe("HubCreateCardSchema", () => {
  it("accepts qa with front and back", () => {
    const parsed = HubCreateCardSchema.safeParse({
      type: "qa",
      front: " What? ",
      back: " Answer ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe("qa");
      expect(parsed.data.front).toBe("What?");
      expect(parsed.data.back).toBe("Answer");
    }
  });

  it("allows empty cloze Extra back", () => {
    const parsed = HubCreateTextCardSchema.safeParse({
      type: "cloze",
      front: "The {{c1::kidney}} filters blood",
      back: "  ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.back).toBe("");
    }
  });

  it("rejects qa with empty back", () => {
    const parsed = HubCreateTextCardSchema.safeParse({
      type: "qa",
      front: "Q",
      back: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts image_label with media keys", () => {
    const parsed = HubCreateCardSchema.safeParse({
      type: "image_label",
      front: "Label this",
      back: "Aorta",
      media_r2_keys: ["materials/d1/m1.png"],
    });
    expect(parsed.success).toBe(true);
  });
});
