import { describe, expect, it } from "vitest";
import {
  resolveChosenPhoto,
  type CoverPhoto,
} from "../../worker/covers/model";

const photo = (id: string, downloads: number, imageUrl: string): CoverPhoto => ({
  id,
  downloads,
  imageUrl,
  photographerName: "Ada",
  photographerUrl: "https://unsplash.com/@ada",
  photoHtmlUrl: `https://unsplash.com/photos/${id}`,
  downloadLocation: `https://api.unsplash.com/photos/${id}/download?ixid=1`,
});

describe("cover model helpers", () => {
  it("rejects a photo id the worker did not fetch", () => {
    const known = [photo("p1", 3, "https://images.unsplash.com/a?ixid=1")];
    expect(resolveChosenPhoto("p1", known).imageUrl).toBe(
      "https://images.unsplash.com/a?ixid=1",
    );
    expect(() => resolveChosenPhoto("other", known)).toThrow(/unknown photo/);
  });
});
