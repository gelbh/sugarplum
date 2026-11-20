import { describe, expect, it } from "vitest";
import { lifecyclePanelImage } from "../../src/atlas/lifecycle/lifecyclePanelImage";
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
  it("prefers stage imageId over lifecycle_diagram", () => {
    const images = [
      img({ id: "egg", role: "egg_oocyst" }),
      img({ id: "cycle", role: "lifecycle_diagram" }),
    ];
    expect(lifecyclePanelImage(images, "egg")?.id).toBe("egg");
  });

  it("falls back to lifecycle_diagram when stage has no image", () => {
    const images = [
      img({ id: "egg", role: "egg_oocyst" }),
      img({ id: "cycle", role: "lifecycle_diagram" }),
    ];
    expect(lifecyclePanelImage(images, null)?.id).toBe("cycle");
    expect(lifecyclePanelImage(images, "missing")?.id).toBe("cycle");
  });

  it("returns null when neither stage image nor diagram exists", () => {
    const images = [img({ id: "egg", role: "egg_oocyst" })];
    expect(lifecyclePanelImage(images, null)).toBeNull();
    expect(lifecyclePanelImage(images, "missing")).toBeNull();
  });
});
