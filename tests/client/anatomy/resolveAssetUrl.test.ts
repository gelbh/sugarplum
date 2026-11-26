import { describe, expect, it } from "vitest";
import { parseAnatomySceneManifest } from "../../../src/anatomy/viewer/parseScene";
import { resolveAnatomyAssetUrl } from "../../../src/anatomy/viewer/resolveAssetUrl";

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

  it("parses manifests that use allowlisted https structure assets", () => {
    const url = `${ORIGIN}/equine-gait-animations/equine_gait.glb`;
    const m = parseAnatomySceneManifest({
      id: "equine-gait-animations",
      title: "Equine gait animations",
      structures: [
        {
          id: "root-equine-gait",
          label: "equine gait",
          node: "equine_gait",
          asset: url,
          region: "root",
        },
      ],
      regions: [{ id: "root", label: "Root", defaultActive: true }],
    });
    expect(m.structures[0]?.asset).toBe(url);
    expect(resolveAnatomyAssetUrl(m.id, m.structures[0]!.asset!, [ORIGIN])).toBe(
      url,
    );
  });
});
