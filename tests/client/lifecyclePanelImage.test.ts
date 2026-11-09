import { describe, expect, it } from "vitest";
import { lifecyclePanelImage } from "../../src/atlas/lifecyclePanelImage";
import type { AtlasImageView } from "../../src/atlas/types";

const img = (
  partial: Partial<AtlasImageView> & Pick<AtlasImageView, "id" | "role">,
): AtlasImageView => ({
  src: `/atlas/parasites/${partial.id}.webp`,
  caption: null,
  credit: "x",
  license: "CC0-1.0",
  sourceUrl: "https://example.com",
  isHero: false,
  ...partial,
});

describe("lifecyclePanelImage", () => {
  it("prefers lifecycle_diagram over stage imageId", () => {
    const images = [
      img({ id: "egg", role: "egg_oocyst" }),
      img({ id: "cycle", role: "lifecycle_diagram" }),
    ];
    expect(lifecyclePanelImage(images, "egg")?.id).toBe("cycle");
  });

  it("falls back to stage imageId when no diagram", () => {
    const images = [img({ id: "egg", role: "egg_oocyst" })];
    expect(lifecyclePanelImage(images, "egg")?.id).toBe("egg");
    expect(lifecyclePanelImage(images, null)).toBeNull();
  });
});
