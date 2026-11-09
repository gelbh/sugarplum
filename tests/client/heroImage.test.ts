import { describe, expect, it } from "vitest";
import { heroImage } from "../../src/atlas/AtlasImage";
import type { AtlasEntryView, AtlasImageView } from "../../src/atlas/types";

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

function entry(images: AtlasImageView[]): AtlasEntryView {
  return {
    key: "k",
    canonicalName: "Test spp.",
    commonName: "Test",
    aliases: [],
    images,
  } as AtlasEntryView;
}

describe("heroImage", () => {
  it("returns the isHero image", () => {
    const images = [
      img({ id: "cycle", role: "lifecycle_diagram" }),
      img({ id: "adult", role: "adult", isHero: true }),
    ];
    expect(heroImage(entry(images))?.id).toBe("adult");
  });

  it("does not fall back to a sole lifecycle_diagram", () => {
    const images = [img({ id: "cycle", role: "lifecycle_diagram" })];
    expect(heroImage(entry(images))).toBeNull();
  });
});
