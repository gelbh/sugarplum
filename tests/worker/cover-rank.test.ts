import { describe, expect, it } from "vitest";
import {
  rankCoverPhotos,
  resolveChosenPhoto,
  type CoverPhoto,
} from "../../worker/covers/rank";

const photo = (id: string, downloads: number, imageUrl: string): CoverPhoto => ({
  id,
  downloads,
  imageUrl,
  photographerName: "Ada",
  photographerUrl: "https://unsplash.com/@ada",
  photoHtmlUrl: `https://unsplash.com/photos/${id}`,
  downloadLocation: `https://api.unsplash.com/photos/${id}/download?ixid=1`,
});

describe("cover ranking", () => {
  it("keeps Unsplash search order and caps at six", () => {
    const ranked = rankCoverPhotos(
      [1, 9, 3, 8, 2, 7, 4].map((n) =>
        photo(`p${n}`, n, `https://images.unsplash.com/${n}?ixid=1`),
      ),
    );
    expect(ranked.map((p) => p.id)).toEqual([
      "p1",
      "p9",
      "p3",
      "p8",
      "p2",
      "p7",
    ]);
  });

  it("rejects a photo id the worker did not fetch", () => {
    const known = [photo("p1", 3, "https://images.unsplash.com/a?ixid=1")];
    expect(resolveChosenPhoto("p1", known).imageUrl).toBe(
      "https://images.unsplash.com/a?ixid=1",
    );
    expect(() => resolveChosenPhoto("other", known)).toThrow(/unknown photo/);
  });
});
