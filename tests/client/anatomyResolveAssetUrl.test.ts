import { describe, expect, it } from "vitest";
import { resolveAnatomyAssetUrl } from "../../src/anatomy/resolveAssetUrl";

const ORIGIN = "https://anatomy-assets.example.com";

describe("resolveAnatomyAssetUrl", () => {
  it("resolves relative under /anatomy/<id>/", () => {
    expect(
      resolveAnatomyAssetUrl(
        "equine-gait-animations",
        "./equine_gait.glb",
        [ORIGIN],
      ),
    ).toBe("/anatomy/equine-gait-animations/equine_gait.glb");
  });

  it("passes through allowlisted https URLs", () => {
    const url = `${ORIGIN}/equine-gait-animations/equine_gait.glb`;
    expect(
      resolveAnatomyAssetUrl("equine-gait-animations", url, [ORIGIN]),
    ).toBe(url);
  });

  it("rejects non-allowlisted https hosts", () => {
    expect(
      resolveAnatomyAssetUrl(
        "equine-gait-animations",
        "https://evil.example/x.glb",
        [ORIGIN],
      ),
    ).toBeNull();
  });

  it("rejects http and path traversal relatives", () => {
    expect(
      resolveAnatomyAssetUrl(
        "s",
        "http://anatomy-assets.example.com/x.glb",
        [ORIGIN],
      ),
    ).toBeNull();
    expect(resolveAnatomyAssetUrl("s", "../x.glb", [ORIGIN])).toBeNull();
  });
});
